import boardDefinitions from "../data/boardHardwareDefines.json";

export interface HardwareBuildOption {
    label: string;
    flags: string[];
}
export const hardwareBuildGroups: { key: string; options: HardwareBuildOption[] }[] = [
    {
        key: "konzGyro",
        options: [
            { label: "BMI270", flags: ["USE_ACCGYRO_BMI270"] },
            { label: "BMI160", flags: ["USE_ACCGYRO_BMI160"] },
            { label: "ICM42688P", flags: ["USE_GYRO_SPI_ICM42688P", "USE_ACC_SPI_ICM42688P"] },
            { label: "ICM42605", flags: ["USE_GYRO_SPI_ICM42605", "USE_ACC_SPI_ICM42605"] },
            { label: "ICM42622P", flags: ["USE_ACCGYRO_ICM42622P"] },
            { label: "ICM42686P", flags: ["USE_ACCGYRO_ICM42686P"] },
            { label: "IIM42652 (42652)", flags: ["USE_ACCGYRO_IIM42652"] },
            { label: "IIM42653", flags: ["USE_ACCGYRO_IIM42653"] },
            { label: "LSM6DSV16X", flags: ["USE_ACCGYRO_LSM6DSV16X"] },
            { label: "LSM6DSK320X", flags: ["USE_ACCGYRO_LSM6DSK320X"] },
            { label: "LSM6DSO", flags: ["USE_ACCGYRO_LSM6DSO"] },
            { label: "ICM45686", flags: ["USE_ACCGYRO_ICM45686"] },
            { label: "ICM45605", flags: ["USE_ACCGYRO_ICM45605"] },
            { label: "ICM56686", flags: ["USE_ACCGYRO_ICM56686"] },
        ],
    },
    {
        key: "konzBarometer",
        options: [
            { label: "SPA06-003", flags: ["USE_BARO_SPA06_003"] },
            { label: "BMP580 (I2C)", flags: ["USE_BARO_BMP580"] },
            { label: "BMP580 (SPI)", flags: ["USE_BARO_SPI_BMP580"] },
            { label: "BMP581 (I2C)", flags: ["USE_BARO_BMP581"] },
            { label: "BMP581 (SPI)", flags: ["USE_BARO_SPI_BMP581"] },
            { label: "DPS310", flags: ["USE_BARO_DPS310"] },
            { label: "BMP280", flags: ["USE_BARO_BMP280"] },
        ],
    },
    {
        key: "konzFlash",
        options: [
            {
                label: "SPI NOR · W25Q / GD25Q / BY25Q / MX25L / XT25 / ZD25 / GT25 / FM25Q",
                flags: ["USE_FLASH_M25P16"],
            },
            { label: "W25Q128FV · QuadSPI / OctoSPI", flags: ["USE_FLASH_W25Q128FV"] },
            { label: "PY25Q128HA", flags: ["USE_FLASH_PY25Q128HA"] },
            { label: "W25N01G · NAND", flags: ["USE_FLASH_W25N01G"] },
            { label: "W25N02K · NAND", flags: ["USE_FLASH_W25N02K"] },
            { label: "W25M512", flags: ["USE_FLASH_W25M512"] },
            { label: "W25M02G · NAND", flags: ["USE_FLASH_W25M02G"] },
            { label: "MT29F1G01ABAFDWB · NAND", flags: ["USE_FLASH_MT29F"] },
            { label: "MX66UW1G45G · OctoSPI", flags: ["USE_FLASH_MX66UW1G45G"] },
        ],
    },
];

export function normalizedDefine(tag: string): string {
    return tag.trim().replace(/^USE_/, "").replace(/=.*$/, "");
}

export function hardwareOptionSelected(tags: string[], option: HardwareBuildOption): boolean {
    const current = new Set(tags.map(normalizedDefine));
    return option.flags.every((flag) => current.has(normalizedDefine(flag)));
}

export function toggleHardwareOption(tags: string[], option: HardwareBuildOption, enabled: boolean): string[] {
    const owned = new Set(option.flags.map(normalizedDefine));
    const remaining = tags.filter((tag) => !owned.has(normalizedDefine(tag)));
    return enabled ? [...remaining, ...option.flags] : remaining;
}

/** Firmware 2026.6.2 still guards shared IIM42652 probe registration with the ICM42688P macro. */
export function expandHardwareDefines(tags: string[]): string[] {
    const flags = [...tags];
    const keys = tags.map(normalizedDefine);
    if (keys.includes("ACCGYRO_IIM42652") && !keys.includes("GYRO_SPI_ICM42688P")) {
        flags.push("USE_GYRO_SPI_ICM42688P");
    }
    if (keys.some((key) => key.startsWith("BARO_")) && !keys.includes("BARO")) flags.push("USE_BARO");
    if (keys.some((key) => key.startsWith("FLASH_"))) {
        for (const flag of ["USE_FLASHFS", "USE_BLACKBOX"])
            if (!keys.includes(normalizedDefine(flag))) flags.push(flag);
    }
    return [...new Set(flags)];
}

/** Only exact config hashes allow omitting driver macros already supplied by config.h. */
export function redundantHardwareDefines(tags: string[], configHash?: string): string[] {
    const configs: Record<string, string[]> = boardDefinitions.configs;
    const baseline = new Set(configs[configHash ?? ""] ?? []);
    const hardware = new Set([
        ...hardwareBuildGroups.flatMap((group) =>
            group.options.flatMap((option) => option.flags.map(normalizedDefine)),
        ),
        "BARO",
        "FLASHFS",
        "BLACKBOX",
    ]);
    return tags.filter((tag) => {
        const key = normalizedDefine(tag);
        return hardware.has(key) && baseline.has(`USE_${key}`) && !/=[^=]+$/.test(tag);
    });
}
export function prepareHardwareDefines(tags: string[], configHash?: string): string[] {
    const expanded = expandHardwareDefines(tags);
    const redundant = new Set(redundantHardwareDefines(expanded, configHash));
    return expanded.filter((tag) => !redundant.has(tag));
}
