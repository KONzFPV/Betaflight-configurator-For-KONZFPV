import { beforeEach, expect, it, vi } from "vitest";
import { reactive } from "vue";
const { connection, handler, send, connect, switchTab, flashBoot } = vi.hoisted(() => ({
    connection: { connectionValid: false, virtualMode: false },
    handler: {
        devicePicker: { selectedDevice: "noselection" },
        currentSerialPorts: [],
        showAllSerialDevices: false,
        dfuProtocol: { getDevices: vi.fn(async () => [{}]) },
        refreshAllDeviceLists: vi.fn(async () => {}),
        requestDevicePermission: vi.fn(),
    },
    send: vi.fn(),
    connect: vi.fn(),
    switchTab: vi.fn(),
    flashBoot: vi.fn(() => false),
}));
vi.mock("../../src/stores/connection", () => ({ useConnectionStore: () => reactive(connection) }));
vi.mock("../../src/stores/fc", () => ({ useFlightControllerStore: () => ({ boardHasFlashBootloader: flashBoot }) }));
vi.mock("../../src/js/device_handler", () => ({ default: handler }));
vi.mock("../../src/js/serial_backend", () => ({ connectDisconnect: connect }));
vi.mock("../../src/js/msp", () => ({ default: { send_message: send } }));
vi.mock("../../src/js/msp/MSPCodes", () => ({ default: { MSP_SET_REBOOT: 68 } }));
vi.mock("../../src/js/msp/MSPHelper", () => ({ mspHelper: { REBOOT_TYPES: { BOOTLOADER: 1, BOOTLOADER_FLASH: 4 } } }));
vi.mock("../../src/js/gui", () => ({ default: { connect_lock: false } }));
vi.mock("../../src/js/tab_switch", () => ({ switchTab }));
vi.mock("../../src/utils/flightControllerPorts", () => ({ flightControllerPorts: (ports) => ports }));
import { useDfuEntry, dfuBackupOpen } from "../../src/composables/useDfuEntry";
beforeEach(() => {
    vi.clearAllMocks();
    connection.connectionValid = false;
    connection.virtualMode = false;
    dfuBackupOpen.value = false;
    handler.currentSerialPorts = [];
    flashBoot.mockReturnValue(false);
    send.mockImplementation(() => {
        connection.connectionValid = false;
    });
    connect.mockImplementation(() => {
        connection.connectionValid = true;
    });
});
it("connects the selected board and requests ROM DFU without writing settings", async () => {
    handler.currentSerialPorts = [{ path: "serial_test", displayName: "APM32" }];
    const entry = useDfuEntry();
    await entry.items.value.find((i) => i.label === "APM32").onSelect();
    expect(connect).toHaveBeenCalledOnce();
    expect(handler.devicePicker.selectedDevice).toBe("serial_test");
    expect(send).toHaveBeenCalledWith(68, [1], false);
    expect(switchTab).toHaveBeenCalledWith("firmware_flasher");
    expect(dfuBackupOpen.value).toBe(true);
});
it("uses flash bootloader for boards advertising one", async () => {
    connection.connectionValid = true;
    flashBoot.mockReturnValue(true);
    await useDfuEntry()
        .items.value.find((i) => i.label === "当前飞控进入 USB DFU")
        .onSelect();
    expect(send).toHaveBeenCalledWith(68, [4], false);
});
it("does not reboot a virtual board", async () => {
    connection.connectionValid = true;
    connection.virtualMode = true;
    const entry = useDfuEntry();
    await entry.items.value.find((i) => i.label === "当前飞控进入 USB DFU").onSelect();
    expect(send).not.toHaveBeenCalled();
    expect(entry.error.value).toContain("不支持");
});

it("primary action connects the selected green serial entry before requesting DFU", async () => {
    handler.currentSerialPorts = [{ path: "serial_selected", displayName: "STM32" }];
    handler.devicePicker.selectedDevice = "serial_selected";
    const entry = useDfuEntry();
    await entry.connectAndEnter();
    expect(connect).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(68, [1], false);
    expect(entry.status.value).toContain("已发现 USB DFU");
});
it("primary action directly reboots an already connected board", async () => {
    connection.connectionValid = true;
    const entry = useDfuEntry();
    await entry.connectAndEnter();
    expect(connect).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
});
it("primary action requests a port when none is selected", async () => {
    handler.devicePicker.selectedDevice = "noselection";
    handler.requestDevicePermission.mockResolvedValueOnce({ path: "serial_chosen" });
    await useDfuEntry().connectAndEnter();
    expect(handler.requestDevicePermission).toHaveBeenCalledWith("serial");
    expect(handler.devicePicker.selectedDevice).toBe("serial_chosen");
    expect(send).toHaveBeenCalledOnce();
});
it("cancelled chooser reports cancellation instead of silently returning", async () => {
    handler.devicePicker.selectedDevice = "noselection";
    handler.requestDevicePermission.mockResolvedValueOnce(undefined);
    const entry = useDfuEntry();
    await entry.connectAndEnter();
    expect(entry.status.value).toBe("已取消选择飞控");
    expect(send).not.toHaveBeenCalled();
});
