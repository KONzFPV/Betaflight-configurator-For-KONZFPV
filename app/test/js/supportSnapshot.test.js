import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { parseSupportSnapshot, isSupportId } from "../../src/utils/supportSnapshot";
import { useSupportSnapshotStore } from "../../src/stores/supportSnapshot";

const fixture = "# Betaflight / STM32F722 2026.6.2\nboard_name TEST_BOARD\nserial 0 64 115200 57600 0 115200\nset serialrx_provider = CRSF\naux 0 0 0 1700 2100 0 0\nprofile 1\nset p_roll = 45\nrateprofile 2\nset roll_rc_rate = 100\n";
const id = "29502fbe-8293-455b-a574-6d03183cd0d7";

describe("support snapshot records", () => {
    beforeEach(() => setActivePinia(createPinia()));
    afterEach(() => vi.unstubAllGlobals());
    it("preserves raw output and distinguishes serial receiver settings from UART assignments", () => {
        const parsed = parseSupportSnapshot(JSON.stringify({ text: fixture }));
        expect(parsed.text).toBe(fixture);
        expect(parsed.board).toBe("TEST_BOARD");
        expect(parsed.entries.find((entry) => entry.command.includes("serialrx_provider"))?.section).toBe("receiver");
        expect(parsed.entries.find((entry) => entry.command.startsWith("serial "))?.section).toBe("ports");
        expect(parsed.entries.find((entry) => entry.command.startsWith("aux "))?.section).toBe("modes");
        expect(parsed.entries.find((entry) => entry.command.includes("p_roll"))?.context).toBe("profile 1");
        expect(parsed.entries.find((entry) => entry.command.includes("roll_rc_rate"))?.context).toBe("rateprofile 2");
    });
    it("rejects HTML, arbitrary JSON, missing records, oversized files and non-ID paths", () => {
        for (const value of ["<html># Betaflight</html>", "{}", "", "x".repeat(1024 * 1024 + 1)])
            expect(() => parseSupportSnapshot(value)).toThrow("konzSnapshotInvalid");
        for (const value of ["https://example.test", "../commands", "commands", "29502fbe"])
            expect(isSupportId(value)).toBe(false);
        expect(isSupportId(id)).toBe(true);
    });
    it("does not restore an old network result after the user closes the snapshot", async () => {
        let resolve;
        vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
        const store = useSupportSnapshotStore();
        const pending = store.loadId(id);
        store.clear();
        resolve({ ok: true, text: async () => fixture });
        await pending;
        expect(store.snapshot).toBeNull();
    });
    it("shows invalid server payload errors and retains local loading without any network calls", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "{}" })));
        const store = useSupportSnapshotStore();
        await store.loadId(id);
        expect(store.error).toBe("konzSnapshotInvalid");
        expect(store.loading).toBe(false);
        store.loadText(fixture, "local.txt");
        expect(store.source).toBe("local.txt");
        expect(store.snapshot.board).toBe("TEST_BOARD");
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
