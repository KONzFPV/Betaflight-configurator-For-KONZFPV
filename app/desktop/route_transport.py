"""Three fixed CF routes, independent ECH records and sanitized UI status."""
import hashlib
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


def direct(url, host, ip, ech, method='GET', body=None, headers=None, probe=False):
    opts = {CurlOpt.PROXY: b'', CurlOpt.NOPROXY: b'*',
            CurlOpt.RESOLVE: [f'{host}:443:{ip}'.encode()], CurlOpt.ECH: ('ecl:' + ech).encode(),
            CurlOpt.LOW_SPEED_LIMIT: 256, CurlOpt.LOW_SPEED_TIME: 10}
    with requests.Session(trust_env=False, curl_options=opts) as session:
        return session.request(method, url, data=body, headers=headers or {},
                               impersonate='chrome', timeout=(3, 5) if probe else (5, 25),
                               allow_redirects=False)


def refresh(route):
    with REFRESH_LOCKS[route]:
        with LOCK:
            current = dict(STATE[route])
        if time.time() - current.get('updated', 0) < 180:
            return
        for ip in ['104.16.249.249', '104.16.248.249']:
            try:
                reply = direct(f'https://cloudflare-dns.com/dns-query?name={GATEWAYS[route]}&type=HTTPS',
                               'cloudflare-dns.com', ip, current['ech'],
                               headers={'Accept': 'application/dns-json'}, probe=True)
                record = next(x['data'] for x in reply.json()['Answer'] if x['type'] == 65 and 'ech=' in x['data'])
                ech = re.search(r'ech=([^ ]+)', record)[1]
                ips = re.search(r'ipv4hint=([^ ]+)', record)[1].split(',')
                if not ips or not all(re.fullmatch(r'(?:\d{1,3}\.){3}\d{1,3}', x) for x in ips):
                    continue
                with LOCK:
                    STATE[route].update(ech=ech, ips=ips[::-1], updated=time.time())
                    if CACHE:
                        CACHE.parent.mkdir(parents=True, exist_ok=True)
                        CACHE.write_text(json.dumps({'routes': STATE}), encoding='utf-8')
                return
            except Exception:
                continue


def route_request(route, path, method='GET', body=None, headers=None, probe=False):
    refresh(route)
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
                continue
            return reply
        except Exception:
            continue
    raise RuntimeError('线路暂时无法连接，请重试或选择其他线路')


def snapshot():
    with LOCK:
        return {'selected': SELECTED, 'routes': [dict(STATUS[key]) for key in GATEWAYS]}


def probe_route(route):
    samples = []
    refresh(route)
    for _ in range(2):
        start = time.monotonic()
        try:
            reply = route_request(route, '/health', probe=True)
            data = reply.json()
            if reply.status_code == 200 and data.get('status') == 'ok' and 'build' in data.get('features', []):
                samples.append(round((time.monotonic() - start) * 1000))
        except Exception:
            pass
    with LOCK:
        STATUS[route].update(available=bool(samples), latencyMs=round(sum(samples) / len(samples)) if samples else None)


def control(job):
    global SELECTED
    action = job.get('action')
    if action == 'probe':
        with PROBE_LOCK:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as probes:
                list(probes.map(probe_route, GATEWAYS))
            with LOCK:
                usable = [value for value in STATUS.values() if value['available']]
                if usable:
                    SELECTED = min(usable, key=lambda value: value['latencyMs'])['id']
    elif action == 'select':
        route = job.get('routeId')
        if type(route) is not int or route not in GATEWAYS:
            raise ValueError('Invalid route')
        with LOCK:
            SELECTED = route
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
    with LOCK:
        routes = [SELECTED] + [r for r in GATEWAYS if r != SELECTED]
    for route in routes:
        refresh(route)
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
                                        impersonate='chrome', timeout=(5, 600), allow_redirects=False) as response:
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
    start = time.monotonic()
    result = {'id': job.get('id')}
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
                if isinstance(item.get('ech'), str) and isinstance(item.get('ips'), list):
                    STATE[key].update(item)
        except Exception:
            pass
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for line in sys.stdin:
            try:
                pool.submit(handle, json.loads(line))
            except Exception:
                continue


if __name__ == '__main__':
    run()
