import { afterEach, expect, it, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: { request } }));
const originalFetch = window.fetch;
afterEach(() => { window.fetch = originalFetch; vi.resetModules(); request.mockReset(); });

it("Android native HTTP handles JSON objects and firmware binary through fixed CF gateways", async () => {
    await import("../../src/js/mobileNetwork");
    request.mockResolvedValueOnce({ status: 200, headers: { "Content-Type": "application/json" }, data: { targets: ["TEST"] } });
    const json = await window.fetch(new URL("./build-api.php?path=/api/targets/2026.6.2", location.href));
    expect(await json.json()).toEqual({ targets: ["TEST"] });
    expect(request.mock.calls[0][0].url).toBe("https://fpvfix-gateway.mgsmdx.workers.dev/build/api/targets/2026.6.2");
    request.mockResolvedValueOnce({ status: 200, headers: { "content-type": "application/octet-stream" }, data: btoa("\x00\xff\x08") });
    const binary = await window.fetch("https://build.betaflight.com/api/builds/key/hex");
    expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([0, 255, 8]);
});

it("GET may fail over but a timed-out compilation POST is never repeated", async () => {
    await import("../../src/js/mobileNetwork");
    request.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ status: 200, headers: { "content-type": "application/json" }, data: [] });
    await window.fetch("https://build.betaflight.com/api/options/2026.6.2");
    expect(request).toHaveBeenCalledTimes(2);
    request.mockClear();
    request.mockRejectedValue(new Error("response lost"));
    await expect(window.fetch("https://build.betaflight.com/api/builds", { method: "POST", body: JSON.stringify({ target: "TEST" }), headers: { "content-type": "application/json" } })).rejects.toThrow("未确认");
    expect(request).toHaveBeenCalledTimes(1);
});
