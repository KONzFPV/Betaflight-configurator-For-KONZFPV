import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const { BatchFlasher, firmwareBinary, parseDevices } = await import(process.env.KONZ_BATCH_MODULE);
const record = (addr, type, bytes) => {
    const a = [bytes.length, addr >> 8, addr & 255, type, ...bytes];
    a.push(-a.reduce((x, y) => x + y, 0) & 255);
    return ":" + Buffer.from(a).toString("hex");
};
const hex = (lines) => Buffer.from(lines.join("\n"));
const header = record(0, 4, [8, 0]),
    eof = record(0, 1, []);
const device = (n) =>
    'Found DFU: [0483:df11] ver=2200, devnum=1, cfg=1, intf=0, path="1-' +
    n +
    '", alt=0, name="@Internal Flash /0x08000000/04*016Kg", serial="SN' +
    n +
    '"';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (check) => {
    const end = Date.now() + 3000;
    while (!check()) {
        if (Date.now() > end) throw Error("timed out");
        await new Promise((r) => setTimeout(r, 10));
    }
};
test("HEX parser checks checksum, EOF, overlaps, range and preserves gaps", () => {
    const output = firmwareBinary(hex([header, record(0, 0, [1, 2, 3]), record(6, 0, [4]), eof]), ".hex");
    assert.deepEqual([...output], [1, 2, 3, 255, 255, 255, 4]);
    for (const bad of [
        [header, ":0300000001020300", eof],
        [header, record(0, 0, [1])],
        [header, record(0, 0, [1, 2]), record(1, 0, [2]), eof],
        [record(0, 4, [0, 0]), record(0, 0, [1]), eof],
        [header, record(1, 0, [1]), eof],
        [header, record(0, 0, [1]), eof, record(1, 0, [2])],
    ])
        assert.throws(() => firmwareBinary(hex(bad), ".hex"));
    assert.throws(() => firmwareBinary(Buffer.alloc(0), ".bin"));
    assert.throws(() => firmwareBinary(Buffer.alloc(2 * 1024 * 1024 + 1), ".bin"));
});
test("device discovery excludes non-DFU, external flash, ambiguous serial and unsafe paths", () => {
    assert.equal(parseDevices(device(1) + "\n" + device(1)).length, 1);
    assert.equal(parseDevices(device(1) + "\n" + device(2).replace("SN2", "SN1")).length, 0);
    for (const bad of [
        device(1).replace("0483:df11", "ffff:eeee"),
        device(1).replace("alt=0", "alt=1"),
        device(1).replace("@Internal Flash", "@Option Bytes"),
        device(1).replace("SN1", "bad serial"),
    ])
        assert.equal(parseDevices(bad).length, 0);
    assert.equal(parseDevices(device(1).replace("0483:df11", "314b:0106")).length, 1);
});
test("7 devices: at most 5 concurrent writes, queued scans, stop drains, no repeat writes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "konz-batch-test-"));
    const firmware = path.join(dir, "test.bin");
    await writeFile(firmware, Buffer.from([1, 2, 3, 4]));
    let devices = Array.from({ length: 7 }, (_, i) => device(i + 1)).join("\n");
    const writes = [];
    let concurrent = 0,
        max = 0;
    const runner = async (_exe, args, onData) => {
        if (args[0] === "-l") return { code: 0, output: devices };
        if (args.includes("-U")) {
            await writeFile(args[args.indexOf("-U") + 1], Buffer.from([1, 2, 3, 4]));
            return { code: 0, output: "read complete" };
        }
        if (args.includes(":leave")) return { code: 0, output: "leave" };
        concurrent++;
        max = Math.max(max, concurrent);
        onData("Download 53%\r");
        return new Promise((resolve) =>
            writes.push({
                args,
                finish: (code = 0) => {
                    concurrent--;
                    resolve({ code, output: "done" });
                },
            }),
        );
    };
    const batch = new BatchFlasher("fake", dir, runner);
    try {
        assert.throws(() => batch.start(true));
        await batch.select(firmware);
        assert.throws(() => batch.start(false));
        batch.start(true);
        await settle(() => writes.length === 5);
        assert.equal(writes.length, 5);
        assert.equal(batch.state.active, 5);
        assert.equal(max, 5);
        assert.equal(
            batch.state.slots.every((s) => s.progress === 26),
            true,
        );
        await assert.rejects(batch.select(firmware));
        for (const job of writes.slice()) job.finish();
        await settle(() => batch.state.active === 0);
        await batch.scan();
        await settle(() => writes.length === 7);
        assert.equal(writes.length, 7);
        assert.equal(batch.state.active, 2);
        assert.equal(max, 5);
        batch.stop();
        for (const job of writes.slice(5)) job.finish();
        await settle(() => batch.state.active === 0);
        assert.equal(batch.state.active, 0);
        batch.start(true);
        await tick();
        assert.equal(writes.length, 7);
        batch.stop();
        for (const job of writes) {
            assert(job.args.includes("-S"));
            assert(job.args.includes("-p"));
            assert(job.args.includes("0x08000000"));
            assert.equal(job.args[job.args.indexOf("-D") + 1], path.join(dir, "batch-firmware.bin"));
        }
    } finally {
        batch.stop();
        for (const job of writes.slice(-2)) if (concurrent > 0) job.finish();
        await settle(() => batch.state.active === 0);
        await rm(dir, { recursive: true, force: true });
    }
});
test("stop during discovery prevents writes; failed devices do not loop and can be explicitly retried", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "konz-batch-failure-"));
    const fw = path.join(dir, "fw.bin");
    await writeFile(fw, Buffer.from([1]));
    let resolveScan,
        writes = 0;
    const runner = async (_e, args) =>
        args[0] === "-l"
            ? await new Promise((r) => (resolveScan = r))
            : (writes++, { code: 74, output: "USB disconnected" });
    const batch = new BatchFlasher("fake", dir, runner);
    try {
        await batch.select(fw);
        batch.start(true);
        batch.stop();
        resolveScan({ code: 0, output: device(1) });
        await tick();
        assert.equal(writes, 0);
        batch.start(true);
        resolveScan({ code: 0, output: device(1) });
        await tick();
        assert.equal(writes, 1);
        assert.equal(batch.state.slots[0].result, "error");
        const scan = batch.scan();
        resolveScan({ code: 0, output: device(1) });
        await scan;
        assert.equal(writes, 1);
        batch.stop();
        await settle(() => batch.state.active === 0);
        await batch.select(fw);
        batch.start(true);
        resolveScan({ code: 0, output: device(1) });
        await tick();
        assert.equal(writes, 2);
    } finally {
        batch.stop();
        await rm(dir, { recursive: true, force: true });
    }
});

for (const mode of ["verified", "leave-failed", "mismatch", "too-large"])
    test("write/read/leave sequence: " + mode, async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "konz-verify-"));
        const firmware = Buffer.alloc(mode === "too-large" ? 65537 : 1024, 42);
        const file = path.join(dir, "fw.bin");
        await writeFile(file, firmware);
        const calls = [];
        const batch = new BatchFlasher("fake", dir, async (_exe, args, onData) => {
            if (args[0] === "-l") return { code: 0, output: device(1) };
            calls.push(args);
            if (args.includes("-U"))
                await writeFile(
                    args[args.indexOf("-U") + 1],
                    mode === "mismatch" ? Buffer.alloc(firmware.length, 0) : firmware,
                );
            onData?.("100%");
            return {
                code: args.includes(":leave") && mode === "leave-failed" ? 74 : 0,
                output: "Submitting leave request; Error during download get_status",
            };
        });
        try {
            await batch.select(file);
            batch.start(true);
            await settle(() => calls.length > 0 || batch.state.slots[0].result === "error");
            batch.stop();
            await settle(() => batch.state.active === 0);
            const slot = batch.state.slots[0];
            assert.equal(slot.result, mode === "verified" ? "success" : mode === "leave-failed" ? "warning" : "error");
            if (mode === "mismatch" || mode === "too-large") assert(!calls.some((args) => args.includes(":leave")));
            if (mode === "too-large") assert.equal(calls.length, 0);
            if (mode === "verified" || mode === "leave-failed")
                assert.deepEqual(
                    calls.map((args) => (args.includes("-U") ? "read" : args.includes("-D") ? "write" : "leave")),
                    ["write", "read", "leave"],
                );
            batch.reset();
            assert.equal(batch.state.firmware, null);
            assert.equal(batch.state.slots[0].result, "idle");
            await batch.select(file);
            assert.equal(batch.state.firmware.bytes, firmware.length);
        } finally {
            batch.stop();
            await settle(() => batch.state.active === 0);
            await rm(dir, { recursive: true, force: true });
        }
    });
test("close during active write drains and clears without restarting or leaving stale deduplication", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "konz-reset-"));
    const file = path.join(dir, "fw.bin");
    await writeFile(file, Buffer.from([1]));
    let finish;
    let writes = 0;
    const batch = new BatchFlasher("fake", dir, async (_e, args) => {
        if (args[0] === "-l") return { code: 0, output: device(1) };
        writes++;
        return new Promise((r) => {
            finish = () => r({ code: 74, output: "interrupted" });
        });
    });
    try {
        await batch.select(file);
        batch.start(true);
        await settle(() => !!finish);
        batch.reset();
        assert.equal(batch.state.running, false);
        assert.equal(batch.state.resetting, true);
        assert.throws(() => batch.start(true));
        finish();
        await settle(() => !batch.state.resetting);
        assert.equal(batch.state.slots[0].serial, "");
        assert.equal(batch.state.firmware, null);
        finish = null;
        await batch.select(file);
        batch.start(true);
        await settle(() => !!finish);
        assert.equal(writes, 2);
        batch.stop();
        finish();
        await settle(() => batch.state.active === 0);
    } finally {
        batch.stop();
        await settle(() => batch.state.active === 0);
        await rm(dir, { recursive: true, force: true });
    }
});
