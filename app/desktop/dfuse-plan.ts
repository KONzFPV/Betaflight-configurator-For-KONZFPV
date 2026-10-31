import { flashLayout } from "./dfu-memory";

/** One element per erase page prevents later elements from erasing earlier writes. */
export function dfusePlan(binary: Buffer, description: string, deviceId: string) {
    const layout = flashLayout(description);
    if (binary.length > layout.bytes) throw new Error("固件超出该设备内部 Flash 容量，未写入");
    const parts = description.split("/").at(-1)!.split(",");
    const elements: { address: number; data: Buffer }[] = [];
    let offset = 0;
    for (const segment of parts) {
        const match = segment.trim().match(/^(\d+)\*(\d+)([BKM])g$/i);
        if (!match) return null;
        const size = Number(match[2]) * { B: 1, K: 1024, M: 1048576 }[match[3].toUpperCase()]!;
        if ((size & (size - 1)) !== 0 || size < 4 || offset % size) return null;
        for (let index = 0; index < Number(match[1]); index++, offset += size) {
            if (offset >= binary.length) continue;
            const page = binary.subarray(offset, Math.min(offset + size, binary.length));
            let end = page.length;
            while (end && page[end - 1] === 255) end--;
            const length = Math.max(4, Math.ceil(end / 4) * 4);
            const data = Buffer.alloc(length, 255);
            page.copy(data, 0, 0, Math.min(length, page.length));
            elements.push({ address: 0x08000000 + offset, data });
        }
    }
    const originalBlocks = Math.ceil(binary.length / 2048);
    const writeBlocks = elements.reduce((sum, element) => sum + Math.ceil(element.data.length / 2048), 0);
    if (originalBlocks - writeBlocks < 8) return null;
    const records = elements.map(({ address, data }) => {
        const header = Buffer.alloc(8);
        header.writeUInt32LE(address, 0);
        header.writeUInt32LE(data.length, 4);
        return Buffer.concat([header, data]);
    });
    const target = Buffer.alloc(274);
    target.write("Target", 0);
    target.writeUInt32LE(
        records.reduce((sum, record) => sum + record.length, 0),
        266,
    );
    target.writeUInt32LE(elements.length, 270);
    const prefix = Buffer.alloc(11);
    prefix.write("DfuSe", 0);
    prefix[5] = 1;
    prefix.writeUInt32LE(11 + target.length + records.reduce((sum, record) => sum + record.length, 0), 6);
    prefix[10] = 1;
    const suffix = Buffer.alloc(16, 255);
    const [vendor, product] = deviceId.split(":").map((part) => Number.parseInt(part, 16));
    suffix.writeUInt16LE(product, 2);
    suffix.writeUInt16LE(vendor, 4);
    suffix.writeUInt16LE(0x011a, 6);
    suffix.write("UFD", 8);
    suffix[11] = 16;
    const content = Buffer.concat([prefix, target, ...records, suffix.subarray(0, 12)]);
    let crc = 0xffffffff;
    for (const byte of content) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    suffix.writeUInt32LE(crc >>> 0, 12);
    return {
        file: Buffer.concat([content, suffix.subarray(12)]),
        elements: elements.length,
        writeBytes: elements.reduce((sum, element) => sum + element.data.length, 0),
        skippedBytes: Math.max(0, binary.length - elements.reduce((sum, element) => sum + element.data.length, 0)),
    };
}

export class BatchProgress {
    private buffer = "";
    private element = 0;
    constructor(
        private count: number,
        private update: (phase: string, progress: number) => void,
    ) {}
    consume(text: string) {
        this.buffer += text;
        const lines = this.buffer.split(/[\r\n]+/);
        this.buffer = lines.pop()!.slice(-2048);
        for (const line of lines) this.line(line);
    }
    private line(line: string) {
        const element = line.match(/Parsing element\s+(\d+)/);
        if (element) this.element = Math.min(this.count, Number(element[1]));
        const percent = line.match(/(\d+)%/);
        if (!percent) return;
        const fraction = Math.min(100, Number(percent[1])) / 100;
        const erase = /Erase/i.test(line),
            write = /Download/i.test(line);
        if (!erase && !write) return;
        const progress = this.count
            ? ((Math.max(1, this.element) - 1 + (erase ? fraction * 0.2 : 0.2 + fraction * 0.8)) / this.count) * 70
            : erase
              ? fraction * 20
              : 20 + fraction * 50;
        this.update(erase ? "擦除 Flash" : "写入固件", Math.floor(progress));
    }
}
