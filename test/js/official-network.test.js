import { describe, expect, it, vi } from "vitest";
import { officialUrl, fetchOfficial } from "../../desktop/official-network";

describe("official connection without a CF gateway", () => {
    it("maps firmware, preset and raw preset paths to their official origins", () => {
        expect(officialUrl("/build/api/targets")).toBe("https://build.betaflight.com/api/targets");
        expect(officialUrl("/presets/master/presets.txt")).toBe("https://presets.betaflight.com/firmware-presets/master/presets.txt");
        expect(officialUrl("/github/betaflight/firmware-presets/master/index.json")).toBe("https://raw.githubusercontent.com/betaflight/firmware-presets/master/index.json");
    });
    it("rejects arbitrary destinations and encoded traversal before making a request", () => {
        for (const path of ["https://example.com", "/build/api/../admin", "/build/api/%2e%2e/admin", "/build/api/a?url=https://example.com", "/github/other/repo/file", "/build/api/%5csecret"])
            expect(() => officialUrl(path)).toThrow();
    });
    it("preserves compile POST bodies and never retries an ambiguous failure", async () => {
        const fetcher = vi.fn().mockRejectedValue(new Error("Connection closed"));
        await expect(fetchOfficial({ path: "/build/api/builds", method: "POST", body: Buffer.from('{"target":"BOARD"}').toString("base64") }, fetcher)).rejects.toThrow("Connection closed");
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0][0]).toBe("https://build.betaflight.com/api/builds");
        expect(fetcher.mock.calls[0][1].body.toString()).toBe('{"target":"BOARD"}');
    });
    it("preserves binary firmware and strips unrelated headers", async () => {
        const firmware = new Uint8Array([0, 255, 16, 127]);
        const fetcher = vi.fn().mockResolvedValue(new Response(firmware, { headers: { "content-type": "application/octet-stream" } }));
        const reply = await fetchOfficial({ path: "/build/api/builds/key/hex", headers: { cookie: "secret", "x-cfg-ver": "2026.6.2" } }, fetcher);
        expect(Buffer.from(reply.body, "base64")).toEqual(Buffer.from(firmware));
        expect(reply.routeId).toBe(0);
        expect(fetcher.mock.calls[0][1].headers).toEqual({ "x-cfg-ver": "2026.6.2" });
    });
});
