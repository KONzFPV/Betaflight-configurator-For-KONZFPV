import { Capacitor, CapacitorHttp } from "@capacitor/core";

const gateways = ["fpvfix-gateway.mgsmdx.workers.dev", "fix2.485250443.workers.dev", "bf2.862462150.workers.dev"];

/** Native HTTP avoids WebView CORS; USB continues through the existing native plugins. */
if (Capacitor.isNativePlatform()) {
    const original = window.fetch.bind(window);
    let preferred = 0;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input instanceof Request ? input : new URL(String(input), location.href), init);
        const url = new URL(request.url);
        let route: string | undefined;
        if (url.origin === location.origin && url.pathname.endsWith("/build-api.php"))
            route = `/build${  url.searchParams.get("path")}`;
        else if (url.hostname === "build.betaflight.com") route = `/build${  url.pathname}`;
        else if (url.hostname === "presets.betaflight.com" && url.pathname.startsWith("/firmware-presets/"))
            route = `/presets/${  url.pathname.slice(18)}`;
        else if (
            url.hostname === "raw.githubusercontent.com" &&
            url.pathname.startsWith("/betaflight/firmware-presets/")
        )
            route = `/github${  url.pathname}`;
        if (!route) return original(request);
        if (
            !/^\/(?:build\/api\/|presets\/|github\/betaflight\/firmware-presets\/)/.test(route) ||
            /\.\.|[?\\\r\n]/.test(route)
        )
            throw new Error("无效的编译请求");
        request.signal.throwIfAborted();
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
            if (["authorization", "content-type", "x-cfg-ver"].includes(key)) headers[key] = value;
        });
        const data = request.method === "GET" ? undefined : JSON.parse(await request.text());
        const order = [preferred, ...gateways.map((_, index) => index).filter((index) => index !== preferred)];
        for (const index of request.method === "GET" ? order : [preferred]) {
            try {
                const response = await CapacitorHttp.request({
                    url: `https://${  gateways[index]  }${route}`,
                    method: request.method,
                    headers,
                    data,
                    responseType: "arraybuffer",
                    connectTimeout: 5000,
                    readTimeout: 25000,
                    disableRedirects: true,
                });
                if (response.status >= 500 && request.method === "GET") continue;
                request.signal.throwIfAborted();
                preferred = index;
                const contentType =
                    Object.entries(response.headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "";
                const body = contentType.includes("application/json")
                    ? new TextEncoder().encode(
                        typeof response.data === "string" ? response.data : JSON.stringify(response.data),
                    )
                    : response.status >= 400
                        ? new TextEncoder().encode(String(response.data))
                        : Uint8Array.from(atob(response.data), (character) => character.charCodeAt(0));
                return new Response([204, 205, 304].includes(response.status) ? null : body, {
                    status: response.status,
                    headers: response.headers,
                });
            } catch (error) {
                request.signal.throwIfAborted();
                if (request.method !== "GET")
                    throw new Error("编译请求未确认，请先查询任务状态后再重试", { cause: error });
            }
        }
        throw new Error("三条 CF 线路暂时无法连接，请稍后重试");
    };
}
