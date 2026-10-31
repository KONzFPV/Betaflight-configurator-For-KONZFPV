import contextlib
import copy
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import route_transport as transport


class Reply:
    status_code = 200
    headers = {'content-type': 'application/json'}
    content = b'{"status":"ok","features":["build"]}'

    def json(self):
        return json.loads(self.content)


class EdgeTests(unittest.TestCase):
    def setUp(self):
        self.state = copy.deepcopy(transport.STATE)
        self.status = copy.deepcopy(transport.STATUS)
        transport.CACHE = None
        transport.ACTIVE_NETWORK = 0
        transport.TUNING_PAUSED = False
        transport.SELECTED = 1
        transport.MANUAL_ROUTE = False

    def tearDown(self):
        transport.STATE.clear()
        transport.STATE.update(self.state)
        transport.STATUS.clear()
        transport.STATUS.update(self.status)
        transport.ACTIVE_NETWORK = 0
        transport.TUNING_PAUSED = False
        transport.CACHE = None

    def test_read_request_never_waits_for_dns_or_tuning(self):
        with patch.object(transport, 'refresh', side_effect=AssertionError('blocking DNS')), patch.object(transport, 'direct', return_value=Reply()):
            self.assertEqual(transport.route_request(1, '/health').status_code, 200)

    def test_measure_real_host_rejects_fast_html_and_bad_tls(self):
        transport.STATE[1]['ips'] = ['104.16.0.1']
        transport.STATE[1]['dns_ips'] = ['104.17.0.1']
        calls = []

        def direct(url, host, ip, ech, **kwargs):
            calls.append((url, host, ip, kwargs))
            if ip == '104.16.0.1':
                reply = Reply()
                reply.content = b'not a gateway'
                return reply
            if ip != '104.17.0.1':
                raise RuntimeError('certificate / ECH failed')
            return Reply()

        with patch.object(transport, 'refresh'), patch.object(transport, 'direct', side_effect=direct):
            transport.probe_route(1)
        self.assertEqual(transport.STATE[1]['ips'][0], '104.17.0.1')
        self.assertTrue(transport.STATUS[1]['available'])
        self.assertTrue(any(url.endswith('/verify/options') for url, *_ in calls))
        self.assertTrue(all(host == transport.GATEWAYS[1] and url.startswith('https://' + host) for url, host, *_ in calls))

    def test_skip_background_work_during_business_request_or_flashing(self):
        for busy, paused in [(1, False), (0, True)]:
            transport.ACTIVE_NETWORK, transport.TUNING_PAUSED = busy, paused
            with patch.object(transport, 'refresh'), patch.object(transport, 'direct') as call:
                transport.probe_route(1)
                call.assert_not_called()

    def test_updates_prefer_selected_route_and_fallback_from_undeployed_worker(self):
        class Manifest(Reply):
            content = b'{"packages":[]}'
        rejected = Reply()
        rejected.status_code = 404
        output = io.StringIO()
        with patch.object(transport, 'route_request', side_effect=[rejected, Manifest()]) as call, contextlib.redirect_stdout(output):
            transport.handle({'id': 1, 'path': '/updates/latest', 'routeId': 3})
        self.assertEqual(call.call_args_list[0].args[0], 3)
        self.assertNotEqual(call.call_args_list[1].args[0], 3)
        self.assertEqual(json.loads(output.getvalue())['status'], 200)
        self.assertEqual(transport.ACTIVE_NETWORK, 0)
        self.assertEqual(transport.SELECTED, 1)

    def test_cache_is_atomic_and_contains_no_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            transport.CACHE = Path(directory) / 'cf-config.json'
            transport.save_cache()
            saved = json.loads(transport.CACHE.read_text())
            self.assertEqual(saved['selected'], 1)
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

    def test_private_invalid_and_non_cf_candidates_are_excluded(self):
        values = ['127.0.0.1', '192.168.1.1', '8.8.8.8', '999.1.1.1', 'example.com', '104.16.0.1', '104.16.0.1']
        self.assertEqual(transport.unique_ips(values), ['104.16.0.1'])
        for value in [-1, True, '1', 4]:
            with self.assertRaises(ValueError):
                transport.ordered_routes(value)


if __name__ == '__main__':
    unittest.main()
