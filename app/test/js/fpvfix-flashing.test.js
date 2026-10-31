import { describe, expect, it, vi } from "vitest";
import { useFirmwareFlashing } from "../../src/composables/useFirmwareFlashing";

vi.mock("../../src/js/gui", () => ({ default: {} }));
vi.mock("../../src/js/ConfigInserter", () => ({ default: {} }));
vi.mock("../../src/js/Analytics", () => ({ tracking: { sendEvent: vi.fn(), EVENT_CATEGORIES: {} } }));
vi.mock("../../src/js/workers/hex_parser", () => ({ default: vi.fn() }));
vi.mock("../../src/js/protocols/webstm32", () => ({ default: {} }));
vi.mock("../../src/js/protocols/esp32", () => ({ default: {} }));
vi.mock("../../src/js/device_handler", () => ({ default: {} }));
vi.mock("../../src/js/connection_state", () => ({ getConnectionState: vi.fn() }));

function workflowOptions(overrides = {}) {
    return {
        firmwareType: "HEX",
        portAvailable: true,
        startBackup: vi.fn(() => {
            throw new Error("Unexpected automatic backup");
        }),
        saveFirmware: vi.fn().mockResolvedValue(true),
        initiateFlashing: vi.fn().mockResolvedValue(undefined),
        startFlashing: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe("FPVFIX flash workflow", () => {
    it("starts a connected serial flash without automatic backup or firmware saving", async () => {
        const options = workflowOptions();
        await useFirmwareFlashing().runFlashWorkflow(options);
        expect(options.initiateFlashing).toHaveBeenCalledOnce();
        expect(options.startBackup).not.toHaveBeenCalled();
        expect(options.saveFirmware).not.toHaveBeenCalled();
    });

    it.each([{ portAvailable: false }, { flashOnConnect: true }])(
        "preserves immediate DFU/auto-flash flow: %j",
        async (overrides) => {
            const options = workflowOptions(overrides);
            await useFirmwareFlashing().runFlashWorkflow(options);
            expect(options.startFlashing).toHaveBeenCalledOnce();
            expect(options.initiateFlashing).not.toHaveBeenCalled();
            expect(options.startBackup).not.toHaveBeenCalled();
        },
    );

    it("does not begin any operation when another connection owns the port", async () => {
        const options = workflowOptions({ connectLock: true });
        await useFirmwareFlashing().runFlashWorkflow(options);
        expect(options.initiateFlashing).not.toHaveBeenCalled();
        expect(options.startFlashing).not.toHaveBeenCalled();
        expect(options.startBackup).not.toHaveBeenCalled();
    });

    it("retains UF2 saving without entering the STM32 flow", async () => {
        const options = workflowOptions({ firmwareType: "UF2" });
        await useFirmwareFlashing().runFlashWorkflow(options);
        expect(options.saveFirmware).toHaveBeenCalledOnce();
        expect(options.initiateFlashing).not.toHaveBeenCalled();
        expect(options.startBackup).not.toHaveBeenCalled();
    });
});
