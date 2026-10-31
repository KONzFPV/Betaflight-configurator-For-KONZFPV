import { serialDevices } from "@/js/protocols/devices";
/** Keep generic system ports out of the flight-controller menu unless explicitly requested. */
export function flightControllerPorts(ports: any[], showAll = false) {
    return ports.filter(
        (port) =>
            showAll ||
            serialDevices.some((device) => device.vendorId === port.vendorId && device.productId === port.productId),
    );
}
