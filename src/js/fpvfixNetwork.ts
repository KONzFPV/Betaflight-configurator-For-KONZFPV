type Job = { path: string; method: string; headers: Record<string, string>; body?: string };
type Reply = { status: number; headers: Record<string, string>; body: string };
declare global {
    interface Window {
        fpvfixDesktop?: {
            version: string;
            videos: () => Promise<{ videos: { bvid: string; title: string; cover: string; duration: string; published: number }[]; updated: number | null; stale: boolean }>;
            locate: (job: { source: "system" | "ip" }) => Promise<{ latitude: number; longitude: number; accuracy?: number } | null>;
            routes: (job: {
                action: string;
                routeId?: number;
            }) => Promise<{
                selected: number;
                routes: { id: number; available: boolean | null; latencyMs: number | null }[];
            }>;
            request: (job: Job) => Promise<Reply>;
        };
    }
}

/** Keep local assets offline while routing build and preset fetches through native ECH. */
if (window.fpvfixDesktop) {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input instanceof Request ? input : new URL(String(input), location.href), init);
        const url = new URL(request.url);
        let route: string | undefined;
        if (url.origin === location.origin && url.pathname.endsWith("/build-api.php"))
            route = `/build${  url.searchParams.get("path")}`;
        else if (url.hostname === "build.betaflight.com") route = `/build${  url.pathname}`;
        else if (url.hostname === "presets.betaflight.com" && url.pathname.startsWith("/firmware-presets/"))
            route = `/presets/${  url.pathname.slice("/firmware-presets/".length)}`;
        else if (
            url.hostname === "raw.githubusercontent.com" &&
            url.pathname.startsWith("/betaflight/firmware-presets/")
        )
            route = `/github${  url.pathname}`;
        if (!route) return originalFetch(request);
        request.signal.throwIfAborted();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            headers[key] = value;
        });
        const data = request.method === "GET" ? undefined : new Uint8Array(await request.arrayBuffer());
        const body = data ? btoa(Array.from(data, (x) => String.fromCharCode(x)).join("")) : undefined;
        const reply = await window.fpvfixDesktop!.request({ path: route, method: request.method, headers, body });
        request.signal.throwIfAborted();
        const binary = Uint8Array.from(atob(reply.body), (char) => char.charCodeAt(0));
        return new Response([204, 205, 304].includes(reply.status) ? null : binary, {
            status: reply.status,
            headers: reply.headers,
        });
    };
}

export {};
