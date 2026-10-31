import { test } from "node:test";
import assert from "node:assert/strict";
const { dfusePlan, BatchProgress } = await import(process.env.KONZ_PLAN_MODULE);
const layout = "@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg";

test("DfuSe independently decoded page operations restore dirty Flash including all blank tail pages", () => {
    const expected = Buffer.alloc(1048576, 255);
    expected.fill(42, 0, 16000);
    expected.fill(99, 0x4000, 0x4010);
    expected.fill(31, 0x70000, 0x70101);
    const result = dfusePlan(expected, layout, "0483:df11");
    assert(result.writeBytes < expected.length / 4);
    const file = result.file;
    assert.equal(file.subarray(0, 5).toString(), "DfuSe");
    assert.equal(file.readUInt32LE(6), file.length - 16);
    assert.equal(file.subarray(-8, -5).toString(), "UFD");
    let crc = 0xffffffff;
    for (const byte of file.subarray(0, -4)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    assert.equal(file.readUInt32LE(file.length - 4), crc >>> 0);
    assert.equal(file.readUInt16LE(file.length - 10), 0x011a);
    const memory = Buffer.alloc(expected.length, 0);
    const pages = [...Array(4).fill(16384), 65536, ...Array(7).fill(131072)];
    const visited = new Set();
    let cursor = 285;
    for (let i = 0; i < file.readUInt32LE(281); i++) {
        const address = file.readUInt32LE(cursor) - 0x08000000;
        const length = file.readUInt32LE(cursor + 4);
        const pageIndex = pages.findIndex(
            (_size, index) => pages.slice(0, index).reduce((a, b) => a + b, 0) === address,
        );
        assert(pageIndex >= 0);
        assert(!visited.has(pageIndex), "one erase page must never be erased twice");
        visited.add(pageIndex);
        assert(length > 0 && length <= pages[pageIndex]);
        memory.fill(255, address, address + pages[pageIndex]);
        file.copy(memory, address, cursor + 8, cursor + 8 + length);
        cursor += 8 + length;
    }
    assert.equal(cursor, file.length - 16);
    assert.equal(visited.size, pages.length);
    assert.deepEqual(memory, expected);
});

test("dense and unknown erase layouts use original raw path; oversize never creates a plan", () => {
    assert.equal(dfusePlan(Buffer.alloc(65536, 42), layout, "0483:df11"), null);
    assert.equal(dfusePlan(Buffer.alloc(65536, 255), "@Internal Flash /0x08000000/04*016Ke", "0483:df11"), null);
    assert.throws(() => dfusePlan(Buffer.alloc(1048577), layout, "0483:df11"));
});

test("fragmented USB logs yield ordered phase progress without resetting on each element", () => {
    const values = [];
    const progress = new BatchProgress(2, (phase, value) => values.push([phase, value]));
    for (const text of [
        "Parsing elem",
        "ent 1, address = 0x08000000\nEra",
        "se [==] 100%\rDown",
        "load [==] 0%\rDownload [==] 100%\rParsing element 2, address = 0x08004000\nErase 0%\rErase 100%\rDownload 100%\r",
    ])
        progress.consume(text);
    assert.equal(values.at(-1)[1], 70);
    assert(values.every((item, index) => index === 0 || item[1] >= values[index - 1][1]));
    assert(values.some(([phase]) => phase.includes("擦除")));
    assert(values.some(([phase]) => phase.includes("写入")));
});
