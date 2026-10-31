import { describe, expect, it, vi, beforeEach } from "vitest";
import { useFirmwareFlashing } from "../../src/composables/useFirmwareFlashing";
import ConfigInserter from "../../src/js/ConfigInserter";
vi.mock("../../src/js/gui", () => ({ default: {} }));
vi.mock("../../src/js/Analytics", () => ({ tracking: { sendEvent: vi.fn(), EVENT_CATEGORIES: {} } }));
vi.mock("../../src/js/protocols/webstm32", () => ({ default: {} }));
vi.mock("../../src/js/protocols/esp32", () => ({ default: {} }));
vi.mock("../../src/js/connection_state", () => ({ getConnectionState: vi.fn() }));
const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../src/js/device_handler", () => ({
    default: {
        devicePicker: { selectedDevice: "usb_test" },
        dfuProtocol: { connect },
    },
}));
const record = (address, type, data) => {
    const bytes = [data.length, address >> 8, address & 255, type, ...data];
    bytes.push(-bytes.reduce((a, b) => a + b, 0) & 255);
    return `:${  bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};
const data = new Uint8Array(65536).fill(255);
const view = new DataView(data.buffer);
view.setUint32(0x2800, 0x08004000, true);
view.setUint32(0x2804, 0x08008000, true);
const lines = [record(0, 4, [8, 0])];
for (let i = 0; i < data.length; i += 16) lines.push(record(i, 0, [...data.slice(i, i + 16)]));
lines.push(record(0, 1, []));
const hex = `${lines.join("\r\n")  }\r\n`;
beforeEach(() => connect.mockReset());
describe("complete local HEX restore", () => {
    it("reproduces occupied defaults and flashes local backup bytes unchanged despite old board configuration", async () => {
        const flashing = useFirmwareFlashing();
        await flashing.processFirmware(hex, "hex", { key: "backup.hex", isLocalFile: true });
        const parsed = flashing.getParsedHex();
        expect(() => new ConfigInserter().insertConfig(parsed, {})).toThrow("Configuration area in firmware not free");
        const before = JSON.stringify(parsed);
        await flashing.startFlashing({ localFirmwareLoaded: true, config: "board_name OTHER", filename: "backup.hex" });
        expect(connect).toHaveBeenCalledOnce();
        expect(JSON.stringify(parsed)).toBe(before);
        expect(Uint8Array.from(connect.mock.calls[0][1].data.flatMap((b) => b.data))).toEqual(data);
    });
    it("reports transport failures and resets the UI rather than leaving a silent locked state", async () => {
        const message = vi.fn(),
            reset = vi.fn();
        const flashing = useFirmwareFlashing({ flashingMessage: message, FLASH_MESSAGE_TYPES: { INVALID: "invalid" } });
        await flashing.processFirmware(hex, "hex", { key: "backup.hex", isLocalFile: true });
        connect.mockImplementationOnce(() => {
            throw new Error("device unavailable");
        });
        await flashing.startFlashing({ localFirmwareLoaded: true, resetFlashingState: reset });
        expect(reset).toHaveBeenCalledOnce();
        expect(message).toHaveBeenCalledWith("烧录失败：device unavailable", "invalid");
    });
});
