import { afterEach, describe, expect, it, vi } from "vitest";
import { locateMap, validLocation } from "../../src/utils/mapLocation";
afterEach(() => { delete window.fpvfixDesktop; });
describe("computer location source preference", () => {
    it("does not query an IP provider after a valid system fix", async () => {
        const locate = vi.fn().mockResolvedValue({ latitude: 23.1, longitude: 113.2 });
        window.fpvfixDesktop = { locate };
        expect(await locateMap()).toEqual({ latitude: 23.1, longitude: 113.2, source: "system" });
        expect(locate.mock.calls).toEqual([[{ source: "system" }]]);
    });
    it("falls back to the isolated direct IP channel when system location is unavailable", async () => {
        const locate = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({ latitude: 0, longitude: 0 });
        window.fpvfixDesktop = { locate };
        expect(await locateMap()).toEqual({ latitude: 0, longitude: 0, source: "ip" });
        expect(locate.mock.calls).toEqual([[{ source: "system" }], [{ source: "ip" }]]);
    });
    it("reports failure instead of inventing a location when both sources fail", async () => {
        window.fpvfixDesktop = { locate: vi.fn().mockRejectedValue(new Error("denied")) };
        expect(await locateMap()).toBeNull();
        for (const invalid of [{ latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: "23", longitude: "113" }]) expect(validLocation(invalid)).toBe(false);
    });
});
