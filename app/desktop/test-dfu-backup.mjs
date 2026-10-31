import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const { DfuBackup, backupDevices, flashLayout, intelHex } = await import(process.env.KONZ_BACKUP_MODULE);
const { firmwareBinary } = await import(process.env.KONZ_BATCH_MODULE);
const line =
    'Found DFU: [0483:df11] ver=2200, path="1-2", alt=0, name="@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg", serial="TEST"';
test("capacity parsing rejects unknown, unreadable, oversized and ambiguous layouts", () => {
    assert.equal(flashLayout("@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg").bytes, 1048576);
    for (const name of [
        "@Option Bytes /0x08000000/01*016Kg",
        "@Internal Flash /0x08000000/01*016Kb",
        "@Internal Flash /0x08000000/99*128Kg",
        "@Internal Flash /0x08000000/00*016Kg",
        "@Internal Flash /0x08000000/04*016Kg/junk",
    ])
        assert.throws(() => flashLayout(name));
    assert.equal(backupDevices(line.replace("0483:df11", "314b:0106"))[0].family, "APM32");
    assert.equal(backupDevices(line + "\n" + line.replace('path="1-2"', 'path="1-3"')).length, 0);
});
test("HEX round trip preserves every byte including erased settings tail across 64 KiB boundaries", () => {
    const bytes = Buffer.alloc(1048576, 255);
    for (let i = 0; i < bytes.length; i += 997) bytes[i] = i & 255;
    bytes[65535] = 42;
    bytes[65536] = 71;
    bytes[bytes.length - 1] = 19;
    assert.deepEqual(firmwareBinary(Buffer.from(intelHex(bytes)), ".hex"), bytes);
});
test("read path only uploads twice, pins selected device and checks full length", async () => {
    const data = Buffer.alloc(1048576, 37),
        calls = [];
    const backup = new DfuBackup("dfu-util", async (_exe, args) => {
        calls.push(args);
        if (args[0] === "-l") return { code: 0, output: line };
        assert.ok(args.includes("-U"));
        assert.ok(!args.includes("-D"));
        assert.ok(!args.some((x) => /unprotect|mass-erase|:leave/.test(x)));
        assert.equal(args[args.indexOf("-S") + 1], "TEST");
        assert.equal(args[args.indexOf("-p") + 1], "1-2");
        await writeFile(args[args.indexOf("-U") + 1], data);
        return { code: 0, output: "" };
    });
    const result = await backup.read("0483:df11:TEST");
    assert.deepEqual(firmwareBinary(Buffer.from(result.hex), ".hex"), data);
    assert.equal(calls.length, 3);
});
for (const mode of ["protected", "short", "mismatch"])
    test("rejects " + mode + " reads without exporting", async () => {
        let pass = 0;
        const backup = new DfuBackup("dfu-util", async (_exe, args) => {
            if (args[0] === "-l") return { code: 0, output: line };
            if (mode === "protected") return { code: 1, output: "Read protected" };
            await writeFile(args[args.indexOf("-U") + 1], Buffer.alloc(mode === "short" ? 7 : 1048576, pass++));
            return { code: 0, output: "" };
        });
        await assert.rejects(backup.read("0483:df11:TEST"));
    });

test("APM32 read pins its own vendor/product and never uses STM32 identity", async () => {
    const data = Buffer.alloc(1048576, 71);
    const backup = new DfuBackup("dfu-util", async (_exe,args) => {
        if(args[0] === "-l") return {code:0,output:line.replace("0483:df11","314b:0106")};
        assert.equal(args[args.indexOf("-d")+1],"314b:0106");
        assert.ok(args.includes("-U"));
        await writeFile(args[args.indexOf("-U")+1],data);
        return {code:0,output:""};
    });
    const result = await backup.read("314b:0106:TEST");
    assert.deepEqual(firmwareBinary(Buffer.from(result.hex),".hex"),data);
});
