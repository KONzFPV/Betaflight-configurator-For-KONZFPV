"""Three fixed CF routes, independent ECH records and sanitized UI status."""
import hashlib
import ipaddress
import os
import base64
import concurrent.futures
import json
from pathlib import Path
import re
import sys
import threading
import time
from curl_cffi import requests, CurlOpt

GATEWAYS = {1: 'fpvfix-gateway.mgsmdx.workers.dev',
            2: 'fix2.485250443.workers.dev', 3: 'bf2.862462150.workers.dev'}
ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
SEED = json.loads((ROOT / 'network-seed.json').read_text(encoding='utf-8'))
CACHE = None
STATE = {key: dict(ech=SEED['ech'], ips=list(SEED['ips']), updated=0) for key in GATEWAYS}
STATUS = {key: dict(id=key, available=None, latencyMs=None) for key in GATEWAYS}
SELECTED = 1
LOCK = threading.RLock()
REFRESH_LOCKS = {key: threading.Lock() for key in GATEWAYS}
WRITE_LOCK = threading.Lock()
PROBE_LOCK = threading.Lock()
CACHE_LOCK = threading.Lock()
WAKE = threading.Event()
SHUTDOWN = threading.Event()
ACTIVE_NETWORK = 0
TUNING_PAUSED = False
MANUAL_ROUTE = False
DNS_RETRY = {key: 0 for key in GATEWAYS}
EDGE_TTL = 6 * 3600
EDGE_POOL = ['104.16.0.1', '104.17.0.1', '104.18.0.1', '104.19.0.1']
CF_NETWORKS = tuple(ipaddress.ip_network(value) for value in (
    '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '162.158.0.0/15'))


def valid_ip(value):
    try:
        address = ipaddress.ip_address(value)
        return any(address in network for network in CF_NETWORKS)
    except (ValueError, TypeError):
        return False


def unique_ips(values):
    return list(dict.fromkeys(value for value in values if valid_ip(value)))[:12]


def save_cache():
    if not CACHE:
        return
    try:
        with CACHE_LOCK:
            with LOCK:
                data = json.dumps({'routes': STATE, 'selected': SELECTED})
            CACHE.parent.mkdir(parents=True, exist_ok=True)
            temporary = CACHE.with_suffix('.tmp')
            temporary.write_text(data, encoding='utf-8')
            os.replace(temporary, CACHE)
    except OSError:
        pass


def ordered_routes(route_id=0):
    if type(route_id) is not int or route_id not in (0, 1, 2, 3):
        raise ValueError('更新线路无效')
    with LOCK:
        preferred = route_id or SELECTED
        return [preferred] + sorted((r for r in GATEWAYS if r != preferred),
                                    key=lambda r: STATUS[r]['latencyMs'] or 999999)


def direct(url, host, ip, ech, method='GET', body=None, headers=None, probe=False):
    opts = {CurlOpt.PROXY: b'', CurlOpt.NOPROXY: b'*',
            CurlOpt.RESOLVE: [f'{host}:443:{ip}'.encode()], CurlOpt.ECH: ('ecl:' + ech).encode(),
            CurlOpt.LOW_SPEED_LIMIT: 256, CurlOpt.LOW_SPEED_TIME: 10}
    with requests.Session(trust_env=False, curl_options=opts) as session:
        return session.request(method, url, data=body, headers=headers or {},
                               impersonate='chrome', timeout=(3, 5) if probe else (5, 25),
                               allow_redirects=False, verify=True)


def refresh(route):
    with REFRESH_LOCKS[route]:
        with LOCK:
            current = dict(STATE[route])
        if time.time() - current.get('updated', 0) < 180:
            return
        if time.time() - DNS_RETRY[route] < 60:
            return
        DNS_RETRY[route] = time.time()
        for ip in ['104.16.249.249', '104.16.248.249']:
            try:
                reply = direct(f'https://cloudflare-dns.com/dns-query?name={GATEWAYS[route]}&type=HTTPS',
                               'cloudflare-dns.com', ip, current['ech'],
                               headers={'Accept': 'application/dns-json'}, probe=True)
                record = next(x['data'] for x in reply.json()['Answer'] if x['type'] == 65 and 'ech=' in x['data'])
                ech = re.search(r'ech=([^ ]+)', record)[1]
                ips = re.search(r'ipv4hint=([^ ]+)', record)[1].split(',')
                if not ips or not all(valid_ip(x) for x in ips) or not ech or len(ech) > 2048:
                    continue
                with LOCK:
                    STATE[route].update(ech=ech, dns_ips=ips, updated=time.time())
                    if not current.get('optimizedAt'):
                        STATE[route]['ips'] = ips
                save_cache()
                return
            except Exception:
                continue


def route_request(route, path, method='GET', body=None, headers=None, probe=False):
    WAKE.set()
    with LOCK:
        current = dict(STATE[route])
    # A lost POST response may hide an already accepted build; never resubmit it automatically.
    ips = current['ips'] if method == 'GET' else current['ips'][:1]
    for ip in ips:
        try:
            reply = direct('https://' + GATEWAYS[route] + path, GATEWAYS[route], ip,
                           current['ech'], method, body, headers, probe)
            if len(reply.content) > 20 * 1024 * 1024:
                raise ValueError('Response is too large')
            if reply.status_code in (502, 503, 504) and method == 'GET':
                raise RuntimeError('Upstream unavailable')
            if method == 'GET' and ip != current['ips'][0] and reply.status_code < 500:
                with LOCK:
                    STATE[route]['ips'] = unique_ips([ip, *STATE[route]['ips']])
                save_cache()
            return reply
        except Exception:
            if not probe:
                with LOCK:
                    STATE[route]['optimizedAt'] = 0
            continue
    raise RuntimeError('线路暂时无法连接，请重试或选择其他线路')


def snapshot():
    with LOCK:
        return {'selected': SELECTED, 'routes': [dict(STATUS[key]) for key in GATEWAYS]}


def probe_route(route):
    with LOCK:
        if TUNING_PAUSED or ACTIVE_NETWORK:
            return
    refresh(route)
    with LOCK:
        current = dict(STATE[route])
    candidates = unique_ips([*current['ips'], *current.get('dns_ips', []), *SEED['ips'], *EDGE_POOL])

    def measure(ip):
        samples = []
        for _ in range(2):
            with LOCK:
                if TUNING_PAUSED or ACTIVE_NETWORK:
                    return None
            start = time.monotonic()
            try:
                reply = direct('https://' + GATEWAYS[route] + '/health', GATEWAYS[route], ip, current['ech'], probe=True)
                data = reply.json()
                if reply.status_code != 200 or data.get('status') != 'ok' or 'build' not in data.get('features', []):
                    return None
                samples.append((time.monotonic() - start) * 1000)
            except Exception:
                return None
        return ip, round(max(samples))

    measured = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        measured = [item for item in pool.map(measure, candidates) if item]
    if not measured:
        with LOCK:
            if not (TUNING_PAUSED or ACTIVE_NETWORK):
                STATUS[route].update(available=False, latencyMs=None)
        return
    measured.sort(key=lambda item: item[1])
    # Validate the official read API as well, without ever submitting a build.
    winner = None
    for ip, latency in measured[:2]:
        with LOCK:
            if TUNING_PAUSED or ACTIVE_NETWORK:
                return
        try:
            reply = direct('https://' + GATEWAYS[route] + '/verify/options', GATEWAYS[route], ip, current['ech'], probe=True)
            if reply.status_code == 200 and isinstance(reply.json(), (dict, list)):
                winner = (ip, latency)
                break
        except Exception:
            pass
    if not winner:
        with LOCK:
            STATUS[route].update(available=False, latencyMs=None)
        return
    with LOCK:
        if TUNING_PAUSED or ACTIVE_NETWORK:
            return
        STATE[route].update(ips=unique_ips([winner[0], *[ip for ip, _ in measured], *current['ips']]), optimizedAt=time.time())
        STATUS[route].update(available=True, latencyMs=winner[1])
    save_cache()


def background_tuning():
    global SELECTED
    SHUTDOWN.wait(2)
    while not SHUTDOWN.is_set():
        with LOCK:
            due = [r for r in GATEWAYS if time.time() - STATE[r].get('optimizedAt', 0) >= EDGE_TTL]
            paused = TUNING_PAUSED or ACTIVE_NETWORK
        if due and not paused and PROBE_LOCK.acquire(blocking=False):
            try:
                for route in due:
                    with LOCK:
                        if TUNING_PAUSED or ACTIVE_NETWORK:
                            break
                    probe_route(route)
                with LOCK:
                    usable = [s for s in STATUS.values() if s['available']]
                    if usable and not MANUAL_ROUTE:
                        SELECTED = min(usable, key=lambda s: s['latencyMs'])['id']
                save_cache()
            finally:
                PROBE_LOCK.release()
        WAKE.wait(60)
        WAKE.clear()
        # A failed network must not trigger a tight retry loop.
        SHUTDOWN.wait(10)


def control(job):
    global SELECTED, MANUAL_ROUTE
    action = job.get('action')
    if action == 'probe':
        MANUAL_ROUTE = False
        with PROBE_LOCK:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as probes:
                list(probes.map(probe_route, GATEWAYS))
            with LOCK:
                usable = [value for value in STATUS.values() if value['available']]
                if usable:
                    SELECTED = min(usable, key=lambda value: value['latencyMs'])['id']
            save_cache()
    elif action == 'select':
        route = job.get('routeId')
        if type(route) is not int or route not in GATEWAYS:
            raise ValueError('Invalid route')
        with LOCK:
            SELECTED = route
            MANUAL_ROUTE = True
    elif action != 'status':
        raise ValueError('Unsupported route action')
    return snapshot()


def unsupported_endpoint(reply):
    try:
        return reply.status_code == 404 and reply.json().get('error') == 'Unsupported endpoint'
    except (ValueError, AttributeError):
        return False



def download_update(job):
    route_path = job.get('path', '')
    if '..' in route_path or not re.fullmatch(r'/updates/download/[\w.-]{1,100}/[\w.-]{1,180}\.(?:zip|exe)', route_path):
        raise ValueError('Invalid update path')
    expected_size, expected_hash = job.get('bytes'), job.get('sha256', '')
    if type(expected_size) is not int or not 0 < expected_size <= 1024 ** 3 or not re.fullmatch(r'[a-f0-9]{64}', expected_hash):
        raise ValueError('Invalid update integrity')
    target = Path(job.get('file', ''))
    if not target.is_absolute() or not str(target).endswith('.konz-download.part'):
        raise ValueError('Invalid download target')
    routes = ordered_routes(job.get('routeId', 0))
    for route in routes:
        with LOCK:
            current = dict(STATE[route])
        for ip in current['ips']:
            try:
                opts = {CurlOpt.PROXY: b'', CurlOpt.NOPROXY: b'*',
                        CurlOpt.RESOLVE: [f'{GATEWAYS[route]}:443:{ip}'.encode()],
                        CurlOpt.ECH: ('ecl:' + current['ech']).encode(),
                        CurlOpt.LOW_SPEED_LIMIT: 256, CurlOpt.LOW_SPEED_TIME: 20}
                digest, length, notified = hashlib.sha256(), 0, 0
                with requests.Session(trust_env=False, curl_options=opts) as session:
                    with session.stream('GET', 'https://' + GATEWAYS[route] + route_path,
                                        impersonate='chrome', timeout=(5, 600), allow_redirects=False, verify=True) as response:
                        if response.status_code != 200:
                            raise RuntimeError('下载线路暂时不可用')
                        with target.open('wb') as output:
                            for chunk in response.iter_content(chunk_size=262144):
                                length += len(chunk)
                                if length > expected_size:
                                    raise ValueError('更新包大小不符')
                                output.write(chunk)
                                digest.update(chunk)
                                if time.monotonic() - notified > 0.5:
                                    notified = time.monotonic()
                                    with WRITE_LOCK:
                                        print(json.dumps({'id': job['id'], 'progress': round(length / expected_size * 100, 1)}), flush=True)
                if length != expected_size or digest.hexdigest() != expected_hash:
                    raise ValueError('更新包完整性校验失败')
                return {'saved': True, 'routeId': route}
            except Exception:
                target.unlink(missing_ok=True)
    raise RuntimeError('三条CF线路下载失败或更新包校验不一致，请稍后重试')

def handle(job):
    global ACTIVE_NETWORK, TUNING_PAUSED
    start = time.monotonic()
    result = {'id': job.get('id')}
    active = not job.get('action') or job.get('action') == 'update-download'
    with LOCK:
        TUNING_PAUSED = job.get('pauseTuning') is True
        ACTIVE_NETWORK += int(active)
    try:
        if job.get('action') == 'update-download':
            result.update(download_update(job))
        elif job.get('action'):
            result['routeState'] = control(job)
        else:
            path = job.get('path', '')
            method = job.get('method', 'GET')
            if method not in ('GET', 'POST') or not re.match(r'^/(?:build/api/|presets/|github/betaflight/firmware-presets/|updates/latest$|health$)', path):
                raise ValueError('Unsupported request')
            if any(value in path for value in ('..', '?', '\\', '\r', '\n')):
                raise ValueError('Invalid path')
            body = base64.b64decode(job['body'], validate=True) if job.get('body') else None
            support = bool(re.fullmatch(r'/build/api/support(?:/[A-Za-z0-9_-]{1,80})?', path))
            if body and len(body) > (1024 * 1024 if support else 32768):
                raise ValueError('Request is too large')
            with LOCK:
                route = SELECTED
                alternatives = sorted((key for key in GATEWAYS if key != route),
                                      key=lambda key: STATUS[key]['latencyMs'] or 999999)
            routes = [route, *alternatives] if method == 'GET' else [route]
            if path == '/updates/latest':
                routes = ordered_routes(job.get('routeId', 0))
            for candidate in routes:
                try:
                    reply = route_request(candidate, path, method, body, job.get('headers'))
                    # Older deployed gateways omit support APIs. Only an explicit route rejection
                    # permits a POST to the fixed official service; never retry a possibly accepted POST.
                    if support and unsupported_endpoint(reply):
                        reply = direct('https://build.betaflight.com' + path[len('/build'):],
                                       'build.betaflight.com', '104.26.8.24', STATE[candidate]['ech'],
                                       method, body, job.get('headers'))
                    if len(reply.content) > 20 * 1024 * 1024:
                        raise ValueError('Response is too large')
                    if path == '/updates/latest' and reply.status_code != 200:
                        if candidate != routes[-1]:
                            continue
                    if path == '/updates/latest' and reply.status_code == 200:
                        content = reply.json()
                        if not isinstance(content, dict) or not isinstance(content.get('packages'), list):
                            raise ValueError('更新线路未返回版本清单')
                    result.update(status=reply.status_code,
                                  headers={k: v for k, v in reply.headers.items() if k.lower() in ('content-type', 'retry-after', 'x-fpvfix-route')},
                                  body=base64.b64encode(reply.content).decode(), routeId=candidate)
                    break
                except Exception:
                    with LOCK:
                        STATUS[candidate].update(available=False, latencyMs=None)
            else:
                raise RuntimeError('连接失败；如已提交编译，请先确认任务状态再重试' if method == 'POST' else '三条线路暂时无法连接，请稍后重试')
    except Exception as error:
        result['error'] = str(error)
    finally:
        with LOCK:
            ACTIVE_NETWORK -= int(active)
    result['seconds'] = round(time.monotonic() - start, 3)
    with WRITE_LOCK:
        print(json.dumps(result, ensure_ascii=True), flush=True)


def run():
    global CACHE
    CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if CACHE and CACHE.exists():
        try:
            saved = json.loads(CACHE.read_text(encoding='utf-8'))
            for key in GATEWAYS:
                item = saved.get('routes', {}).get(str(key), {})
                if isinstance(item.get('ech'), str) and len(item['ech']) <= 2048 and isinstance(item.get('ips'), list):
                    ips = unique_ips(item['ips'])
                    if ips:
                        STATE[key].update(ech=item['ech'], ips=ips,
                                          optimizedAt=min(time.time(), max(0, item.get('optimizedAt', 0)))
                                          if type(item.get('optimizedAt')) in (int, float) else 0)
            if saved.get('selected') in GATEWAYS:
                globals()['SELECTED'] = saved['selected']
        except Exception:
            pass
    threading.Thread(target=background_tuning, daemon=True).start()
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for line in sys.stdin:
            try:
                pool.submit(handle, json.loads(line))
            except Exception:
                continue
    SHUTDOWN.set()


if __name__ == '__main__':
    run()
