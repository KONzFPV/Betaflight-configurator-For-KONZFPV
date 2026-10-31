export function officialUrl(route: string): string {
    if (typeof route !== "string" || route.length > 1200 || /[?\\\r\n#]/.test(route) || /(?:\.\.|%2e|%2f|%5c)/i.test(route))
        throw new Error("Invalid official request");
    if (route.startsWith("/build/api/")) return "https://build.betaflight.com" + route.slice(6);
    if (route.startsWith("/presets/")) return "https://presets.betaflight.com/firmware-presets/" + route.slice(9);
    if (route.startsWith("/github/betaflight/firmware-presets/"))
        return "https://raw.githubusercontent.com" + route.slice(7);
    throw new Error("Unsupported official request");
}

export async function fetchOfficial(job: any, fetcher: typeof fetch) {
    const url = officialUrl(job.path);
    const method = job.method || "GET";
    if (!["GET", "POST"].includes(method) || (method === "POST" && !job.path.startsWith("/build/api/")))
        throw new Error("Unsupported official method");
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(job.headers || {}))
        if (["content-type", "authorization", "x-cfg-ver"].includes(key.toLowerCase()) && typeof value === "string")
            headers[key] = value;
    const body = job.body ? Buffer.from(job.body, "base64") : undefined;
    if (body && body.length > (/^\/build\/api\/support(?:\/|$)/.test(job.path) ? 1024 * 1024 : 32768))
        throw new Error("Official request is too large");
    const response = await fetcher(url, {
        method, headers, body, redirect: "manual", signal: AbortSignal.timeout(45000),
    });
    if (response.status >= 300 && response.status < 400) throw new Error("Unexpected official redirect");
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                length += value.byteLength;
                if (length > 20 * 1024 * 1024) throw new Error("Official response is too large");
                chunks.push(value);
            }
        } finally {
            await reader.cancel().catch(() => {});
        }
    }
    return {
        status: response.status,
        headers: { "content-type": response.headers.get("content-type") || "application/octet-stream", "x-fpvfix-route": "direct" },
        body: Buffer.concat(chunks).toString("base64"), routeId: 0,
    };
}
