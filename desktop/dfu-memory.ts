export function flashLayout(name: string) {
    const match = name.match(/^@Internal Flash\s*\/0x08000000\/([^/]+)$/i);
    if (!match) throw new Error("无法可靠识别完整内部 Flash 范围");
    let bytes = 0;
    for (const segment of match[1].split(",")) {
        const part = segment.trim().match(/^(\d+)\*(\d+)([BKM])([a-g])$/i);
        if (!part || !["a", "c", "e", "g"].includes(part[4].toLowerCase()))
            throw new Error("内部 Flash 描述无效或不支持读取");
        const count = Number(part[1]),
            size = Number(part[2]);
        if (!count || !size) throw new Error("内部 Flash 容量无效");
        bytes += count * size * { B: 1, K: 1024, M: 1048576 }[part[3].toUpperCase()]!;
    }
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 2 * 1024 * 1024)
        throw new Error("内部 Flash 容量不受支持（最大 2 MiB）");
    return { address: 0x08000000, bytes };
}
