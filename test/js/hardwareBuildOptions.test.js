import { describe, expect, it } from "vitest";
import {
    hardwareBuildGroups,
    hardwareOptionSelected,
    toggleHardwareOption,
    expandHardwareDefines,
    prepareHardwareDefines,
} from "../../src/utils/hardwareBuildOptions";

describe("hardware build definitions", () => {
    it("keeps user macros when toggling a hardware driver with a different USE_ spelling", () => {
        const driver = hardwareBuildGroups[0].options.find((option) => option.label === "ICM42688P");
        const tags = ["GYRO_SPI_ICM42688P", "ACC_SPI_ICM42688P", "CUSTOM_BOARD=1"];
        expect(hardwareOptionSelected(tags, driver)).toBe(true);
        expect(toggleHardwareOption(tags, driver, false)).toEqual(["CUSTOM_BOARD=1"]);
    });
    it("includes dependent subsystems while preserving definitions with values", () => {
        const flags = expandHardwareDefines([
            "USE_ACCGYRO_IIM42652",
            "BARO_SPI_BMP581",
            "FLASH_MT29F",
            "CUSTOM_BOARD=1",
        ]);
        for (const flag of ["USE_GYRO_SPI_ICM42688P", "USE_BARO", "USE_FLASHFS", "USE_BLACKBOX", "CUSTOM_BOARD=1"])
            expect(flags).toContain(flag);
        expect(
            expandHardwareDefines(["USE_BARO", "USE_BARO_BMP580"]).filter((flag) => flag === "USE_BARO"),
        ).toHaveLength(1);
    });
    it("omits macros supplied by the matching board configuration, including shared dependencies", () => {
        const hash = "sha256_bdc0c38da593c6a378661088df0cf957f93c4d72de5b94512ca5f9b01971804c";
        expect(prepareHardwareDefines(["USE_ACCGYRO_BMI270", "USE_BARO_BMP580", "CUSTOM=2"], hash)).toEqual([
            "USE_BARO_BMP580", "CUSTOM=2",
        ]);
    });
    it("never assumes a different or unknown board has the same drivers, and preserves value overrides", () => {
        const tags = ["USE_ACCGYRO_BMI270", "USE_BARO_BMP580", "CUSTOM=2"];
        expect(prepareHardwareDefines(tags, "sha256_unknown")).toEqual([...tags, "USE_BARO"]);
        const hash = "sha256_bdc0c38da593c6a378661088df0cf957f93c4d72de5b94512ca5f9b01971804c";
        expect(prepareHardwareDefines(["USE_ACCGYRO_BMI270=2"], hash)).toEqual(["USE_ACCGYRO_BMI270=2"]);
    });
});
