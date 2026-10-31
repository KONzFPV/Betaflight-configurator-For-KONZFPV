import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/js/localization", () => ({ i18n: { getCurrentLocale: () => "zh_CN" } }));
import { bbText } from "../../src/blackbox-viewer/translate";
describe("blackbox graph names", () => {
    it("translates graph titles and standard graph labels", () => {
        expect(bbText("Graph")).toBe("图表");
        expect(bbText("Motors")).toBe("电机");
        expect(bbText("Gyros")).toBe("陀螺仪");
        expect(bbText("Unfiltered Gyros")).toBe("未滤波陀螺仪");
    });
    it("keeps user custom labels and raw field identifiers intact", () => {
        expect(bbText("我的调参测试1")).toBe("我的调参测试1");
        expect(bbText("gyroADC[0]")).toBe("gyroADC[0]");
    });
});
