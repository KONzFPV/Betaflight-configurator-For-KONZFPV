import { updatesResponse } from "./updates-worker.mjs";
// FPVFIX desktop gateway. Only Betaflight build APIs and preset files are forwarded.
const BUILD = 'https://build.betaflight.com';
const SEGMENT = '[A-Za-z0-9_.-]+';
const READ = new RegExp(`^/api/(?:targets(?:/${SEGMENT}){0,2}|builds/${SEGMENT}(?:/${SEGMENT}){0,2}|options/${SEGMENT}(?:/${SEGMENT})?|releases/${SEGMENT}/commits|app/(?:releases/${SEGMENT}|devices)|support/commands)$`);

export default {
  async fetch(request) {
    if (new URL(request.url).pathname.startsWith("/updates/")) {
      try { return await updatesResponse(request); } catch { return new Response("Update upstream unavailable", {status:502}); }
    }
    const url = new URL(request.url);
    const method = request.method;
    const fail = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
    if (method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return Response.json({ service: 'FPVFIX CF gateway', version: 2, status: 'ok', features: ['build', 'presets'] });
    }
    if (!['GET', 'POST'].includes(method)) return fail(405, 'GET/POST only');
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return fail(400, 'Invalid path'); }
    if (url.search || path.includes('..') || path.includes('\\') || path.length > 1024) return fail(400, 'Invalid path');
    let target;
    let body;
    const headers = new Headers({ Accept: 'application/json, text/plain, application/octet-stream', 'X-CFG-VER': '2026.6.2' });
    if (path.startsWith('/build/')) {
      const api = path.slice('/build'.length);
      if (method === 'GET' && READ.test(api)) target = BUILD + api;
      if (method === 'POST' && api === '/api/builds') {
        if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return fail(415, 'JSON required');
        if (Number(request.headers.get('Content-Length')) > 32768) return fail(413, 'Request too large');
        body = await request.text();
        if (new TextEncoder().encode(body).length > 32768) return fail(413, 'Request too large');
        let data;
        try { data = JSON.parse(body); } catch { return fail(400, 'Invalid JSON'); }
        if (!data || !['target', 'release'].every(k => typeof data[k] === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(data[k])) ||
            !Array.isArray(data.options) || data.options.length > 256 ||
            !data.options.every(x => typeof x === 'string' && x.length <= 256 && !/[\x00-\x1f\x7f]/.test(x))) {
          return fail(400, 'Invalid build request');
        }
        headers.set('Content-Type', 'application/json');
        target = BUILD + api;
      }
      const auth = request.headers.get('Authorization') || '';
      if (/^Bearer [A-Za-z0-9_.~-]{1,8192}$/.test(auth)) headers.set('Authorization', auth);
    } else if (method === 'GET' && /^\/presets\/[A-Za-z0-9_./ ()+-]+$/.test(path)) {
      target = 'https://presets.betaflight.com/firmware-presets/' + path.slice('/presets/'.length);
    } else if (method === 'GET' && /^\/github\/betaflight\/firmware-presets\/[A-Za-z0-9_./ ()+-]+$/.test(path)) {
      target = 'https://raw.githubusercontent.com/' + path.slice('/github/'.length);
    } else if (method === 'GET' && path === '/verify/options') {
      target = BUILD + '/api/options/2026.6.2';
    } else if (method === 'GET' && path === '/verify/presets') {
      target = 'https://presets.betaflight.com/firmware-presets/index.json';
    }
    if (!target) return fail(404, 'Unsupported endpoint');
    try {
      const upstream = await fetch(target, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(20000), cf: { cacheTtl: 0 } });
      if (upstream.status >= 300 && upstream.status < 400) return fail(502, 'Unexpected upstream redirect');
      const out = new Headers({ 'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
        'Cache-Control': 'no-store', 'X-FPVFIX-Route': 'cloudflare-worker', 'X-Content-Type-Options': 'nosniff' });
      if (upstream.headers.has('Retry-After')) out.set('Retry-After', upstream.headers.get('Retry-After'));
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch { return fail(502, 'Official service unavailable or timed out'); }
  },
};
