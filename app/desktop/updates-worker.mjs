const REPO = "KONzFPV/Betaflight-configurator-For-KONZFPV";
const headers = { Accept: "application/vnd.github+json", "User-Agent": "KONz-Updates" };
const safe = /^[\w.-]{1,180}$/;
async function github(url) {
    for (let i = 0; i < 5; i++) {
        const u = new URL(url);
        if (
            ![
                "api.github.com",
                "github.com",
                "release-assets.githubusercontent.com",
                "objects.githubusercontent.com",
            ].includes(u.hostname) ||
            u.protocol !== "https:"
        )
            throw Error("Invalid upstream");
        const r = await fetch(u, { headers, redirect: "manual" });
        if (r.status >= 300 && r.status < 400) {
            url = new URL(r.headers.get("location"), u).href;
            continue;
        }
        return r;
    }
    throw Error("Too many redirects");
}
export async function updatesResponse(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/updates/")) return null;
    if (request.method !== "GET" || url.search || url.pathname.includes(".."))
        return new Response("Invalid update request", { status: 400 });
    if (url.pathname === "/updates/latest") {
        const r = await github("https://api.github.com/repos/" + REPO + "/releases/latest");
        if (r.status === 404) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
        if (!r.ok) return new Response("GitHub release unavailable", { status: 502 });
        const release = await r.json();
        const manifest = release.assets?.find((a) => a.name === "update-manifest.json" && a.size <= 65536);
        if (!manifest) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
        const body = await github(manifest.browser_download_url);
        if (!body.ok) return new Response("Manifest unavailable", { status: 502 });
        const text = await body.text();
        if (text.length > 65536) return new Response("Manifest too large", { status: 502 });
        const data = JSON.parse(text);
        if (data.tag !== release.tag_name) return new Response("Tag mismatch", { status: 502 });
        for (const item of data.packages || [])
            if (!release.assets.some((a) => a.name === item.name && a.size === item.bytes))
                return new Response("Package mismatch", { status: 502 });
        return new Response(text, {
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
        });
    }
    const match = url.pathname.match(/^\/updates\/download\/([\w.-]{1,100})\/([\w.-]{1,180})$/);
    if (!match || !safe.test(match[2]) || !/\.(zip|exe)$/.test(match[2]))
        return new Response("Unknown update endpoint", { status: 404 });
    const r = await github("https://github.com/" + REPO + "/releases/download/" + match[1] + "/" + match[2]);
    if (!r.ok) return new Response("Package unavailable", { status: r.status === 404 ? 404 : 502 });
    const out = new Headers({
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="' + match[2] + '"',
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
    });
    if (r.headers.has("content-length")) out.set("Content-Length", r.headers.get("content-length"));
    return new Response(r.body, { status: 200, headers: out });
}
