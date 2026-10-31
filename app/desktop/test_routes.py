import contextlib
import io
import json
import unittest
from unittest.mock import patch
import route_transport as transport


class Reply:
    status_code = 200
    headers = {'content-type': 'application/json'}
    content = b'{"status":"ok","features":["build"]}'

    def json(self):
        return json.loads(self.content)


class RouteTests(unittest.TestCase):
    def setUp(self):
        transport.SELECTED = 1
        for route in transport.STATUS:
            transport.STATUS[route].update(available=None, latencyMs=None)

    def invoke(self, job):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            transport.handle({'id': 42, **job})
        return json.loads(output.getvalue())

    def test_fastest_healthy_route_wins_and_ui_does_not_expose_hosts(self):
        def probe(route):
            transport.STATUS[route].update(available=route != 3, latencyMs={1: 900, 2: 120, 3: 1}[route])
        with patch.object(transport, 'probe_route', side_effect=probe):
            result = transport.control({'action': 'probe'})
        self.assertEqual(result['selected'], 2)
        self.assertNotIn('workers.dev', json.dumps(result))
        self.assertEqual(set(result['routes'][0]), {'id', 'available', 'latencyMs'})

    def test_get_can_fail_over_but_post_never_resubmits(self):
        with patch.object(transport, 'route_request', side_effect=[RuntimeError('down'), Reply()]) as call:
            result = self.invoke({'path': '/build/api/options/2026.6.2'})
            self.assertEqual(result['routeId'], 2)
            self.assertEqual(call.call_count, 2)
        with patch.object(transport, 'route_request', side_effect=RuntimeError('down')) as call:
            result = self.invoke({'path': '/build/api/builds', 'method': 'POST'})
            self.assertIn('error', result)
            self.assertEqual(call.call_count, 1)

    def test_post_transport_uses_only_one_edge_after_timeout(self):
        with patch.object(transport, 'refresh'), patch.object(transport, 'direct', side_effect=TimeoutError()) as call:
            with self.assertRaises(RuntimeError):
                transport.route_request(1, '/build/api/builds', method='POST')
            self.assertEqual(call.call_count, 1)

    def test_untrusted_paths_and_invalid_routes_never_reach_network(self):
        with patch.object(transport, 'route_request') as call:
            for path in ['/arbitrary/https://example.test', '/build/api/../secret', '/health?url=evil', '/build/api/x\r\nHeader: x']:
                self.assertIn('error', self.invoke({'path': path}))
            self.assertEqual(call.call_count, 0)
        for route in [0, 4, '2', True]:
            self.assertIn('error', self.invoke({'action': 'select', 'routeId': route}))

    def test_support_only_falls_back_after_explicit_rejection(self):
        rejected = Reply()
        rejected.status_code = 404
        rejected.content = b'{"error":"Unsupported endpoint"}'
        with patch.object(transport, 'route_request', return_value=rejected), patch.object(transport, 'direct', return_value=Reply()) as call:
            self.assertEqual(self.invoke({'path': '/build/api/support', 'method': 'POST'})['status'], 200)
            self.assertEqual(call.call_count, 1)
            self.assertEqual(call.call_args.args[0], 'https://build.betaflight.com/api/support')
        rejected.status_code = 502
        with patch.object(transport, 'route_request', return_value=rejected), patch.object(transport, 'direct') as call:
            self.assertEqual(self.invoke({'path': '/build/api/support', 'method': 'POST'})['status'], 502)
            call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
