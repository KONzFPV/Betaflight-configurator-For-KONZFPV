import { computed, ref } from "vue";
import { useConnectionStore } from "@/stores/connection";
import { useFlightControllerStore } from "@/stores/fc";
import DeviceHandler from "@/js/device_handler";
import { connectDisconnect } from "@/js/serial_backend";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import GUI from "@/js/gui";
import { switchTab } from "@/js/tab_switch";
import { flightControllerPorts } from "@/utils/flightControllerPorts";

export const dfuBackupOpen = ref(false);
const busy = ref(false),
    error = ref(""),
    status = ref("");
async function waitFor(check: () => boolean | Promise<boolean>, milliseconds = 15000) {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("等待设备超时，请检查连接，或按 BOOT 键重新插入 USB 后扫描");
}
export function useDfuEntry() {
    const connection = useConnectionStore();
    const fc = useFlightControllerStore();
    async function enter(path?: string) {
        if (busy.value) return;
        busy.value = true;
        error.value = "";
        status.value = "正在准备连接飞控…";
        try {
            if (!connection.connectionValid) {
                if (!path) throw new Error("请先选择飞控进行连接");
                DeviceHandler.devicePicker.selectedDevice = path;
                status.value = "正在连接飞控，请稍候…";
                connectDisconnect();
                await waitFor(() => connection.connectionValid && !GUI.connect_lock);
            }
            if (connection.virtualMode || GUI.connect_lock) throw new Error("当前设备或操作不支持进入 USB DFU");
            const type = fc.boardHasFlashBootloader()
                ? mspHelper.REBOOT_TYPES.BOOTLOADER_FLASH
                : mspHelper.REBOOT_TYPES.BOOTLOADER;
            status.value = "正在请求飞控进入 USB DFU…";
            MSP.send_message(MSPCodes.MSP_SET_REBOOT, [type], false);
            await waitFor(
                async () => !connection.connectionValid && (await DeviceHandler.dfuProtocol.getDevices()).length > 0,
            );
            await DeviceHandler.refreshAllDeviceLists();
            status.value = "已发现 USB DFU 设备，可以扫描并备份";
        } catch (e) {
            error.value = String(e);
            status.value = "进入 USB DFU 失败";
        } finally {
            busy.value = false;
            dfuBackupOpen.value = true;
            switchTab("firmware_flasher");
        }
    }
    const items = computed(() => [
        ...(connection.connectionValid
            ? [{ label: "当前飞控进入 USB DFU", icon: "i-lucide-cpu", onSelect: () => enter() }]
            : []),
        ...flightControllerPorts(DeviceHandler.currentSerialPorts, DeviceHandler.showAllSerialDevices).map((port) => ({
            label: port.displayName,
            icon: "i-lucide-usb",
            onSelect: () => enter(port.path),
        })),
        {
            label: "选择并连接 USB 飞控",
            icon: "i-lucide-usb",
            onSelect: async () => {
                const device = await DeviceHandler.requestDevicePermission("serial");
                if (device?.path) await enter(device.path);
            },
        },
        {
            label: "选择已进入 USB DFU 的设备",
            icon: "i-lucide-search",
            onSelect: async () => {
                error.value = "";
                try {
                    await DeviceHandler.requestDevicePermission("usb");
                } catch (e) {
                    error.value = String(e);
                }
            },
        },
    ]);
    const selectedLabel = computed(() =>
        connection.connectionValid
            ? "当前已连接的飞控"
            : flightControllerPorts(DeviceHandler.currentSerialPorts, DeviceHandler.showAllSerialDevices).find(
                (port) => port.path === DeviceHandler.devicePicker.selectedDevice,
            )?.displayName || "尚未选择飞控",
    );
    async function connectAndEnter() {
        if (busy.value) return;
        if (connection.connectionValid) return enter();
        const selected = flightControllerPorts(
            DeviceHandler.currentSerialPorts,
            DeviceHandler.showAllSerialDevices,
        ).find((port) => port.path === DeviceHandler.devicePicker.selectedDevice);
        if (selected) return enter(selected.path);
        return chooseAndEnter();
    }
    async function chooseAndEnter() {
        if (busy.value) return;
        error.value = "";
        status.value = "请选择要进入 DFU 的 USB 飞控";
        try {
            const device = await DeviceHandler.requestDevicePermission("serial");
            if (device?.path) return enter(device.path);
            status.value = "已取消选择飞控";
        } catch (e) {
            error.value = String(e);
            status.value = "选择飞控失败";
        }
    }
    return { busy, error, status, items, selectedLabel, connectAndEnter, chooseAndEnter };
}
