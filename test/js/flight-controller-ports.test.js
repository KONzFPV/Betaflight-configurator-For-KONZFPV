import { expect, it, vi } from "vitest";
vi.mock("../../src/js/protocols/devices", () => ({
    serialDevices: [
        { vendorId: 0x483, productId: 0x5740 },
        { vendorId: 0x314b, productId: 0x5740 },
        { vendorId: 0x2e3c, productId: 0x5740 },
    ],
}));
import { flightControllerPorts } from "../../src/utils/flightControllerPorts";
it("filters system and unrelated USB ports while keeping STM32, APM32 and AT32", () => {
    const supported = [0x483, 0x314b, 0x2e3c].map((vendorId) => ({ vendorId, productId: 0x5740 }));
    const all = [{}, { vendorId: 11205, productId: 1321 }, ...supported];
    expect(flightControllerPorts(all)).toEqual(supported);
    expect(flightControllerPorts(all, true)).toEqual(all);
});
