import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rm, appendFile } from "node:fs/promises";
import path from "node:path";
import { flashLayout } from "./dfu-memory";
import { dfusePlan, BatchProgress } from "./dfuse-plan";

export function firmwareBinary(data: Buffer, extension: string): Buffer {
    if (extension === ".bin") {
        if (!data.length || data.length > 2 * 1024 * 1024) throw new Error("BIN 固件大小无效（上限 2 MiB）");
        return data;
    }
    if (extension !== ".hex") throw new Error("请选择 .hex 或 .bin 固件");
    let upper = 0,
        eof = false,
        end = 0;
    const chunks: { offset: number; bytes: Buffer }[] = [];
    for (const line of data.toString("utf8").trim().split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (eof || !/^:[0-9a-f]+$/i.test(line) || line.length % 2 !== 1) throw new Error("HEX 记录格式错误");
        const bytes = Buffer.from(line.slice(1), "hex");
        if (bytes.length !== bytes[0] + 5 || bytes.reduce((a, b) => a + b, 0) % 256)
            throw new Error("HEX 长度或校验和错误");
        const address = bytes.readUInt16BE(1),
            type = bytes[3],
            body = bytes.subarray(4, -1);
        if (type === 0 && body.length) {
            const offset = upper + address - 0x08000000;
            if (offset < 0 || offset + body.length > 2 * 1024 * 1024) throw new Error("HEX 地址超出飞控 Flash 范围");
            chunks.push({ offset, bytes: Buffer.from(body) });
            end = Math.max(end, offset + body.length);
        } else if (type === 1 && body.length === 0 && address === 0) eof = true;
        else if ((type === 2 || type === 4) && body.length === 2 && address === 0)
            upper = body.readUInt16BE(0) * (type === 4 ? 65536 : 16);
        else if ((type === 3 || type === 5) && body.length === 4 && address === 0) {
            /* Entry point is not flash data. */
        } else if (type !== 0) throw new Error("不支持的 HEX 记录");
    }
    if (!eof || !chunks.length || Math.min(...chunks.map((c) => c.offset)) !== 0)
        throw new Error("HEX 缺少结束记录或 Flash 起始地址");
    chunks.sort((a, b) => a.offset - b.offset);
    const result = Buffer.alloc(end, 255);
    let last = 0;
    for (const chunk of chunks) {
        if (chunk.offset < last) throw new Error("HEX 数据地址重叠");
        chunk.bytes.copy(result, chunk.offset);
        last = chunk.offset + chunk.bytes.length;
    }
    return result;
}

export function parseDevices(output: string) {
    const devices = new Map<string, any>();
    for (const line of output.split(/\r?\n/)) {
        const id = line.match(/Found DFU: \[(0483:df11|314b:0106)\]/i)?.[1]?.toLowerCase();
        const serial = line.match(/serial="([^"]+)"/)?.[1];
        const usbPath = line.match(/path="([^"]+)"/)?.[1];
        if (!id || !serial || !usbPath || !/alt=0(?:,|\s)/.test(line) || !/@Internal Flash/i.test(line)) continue;
        if (!/^[\w.:-]{1,160}$/.test(serial) || !/^[\w.:-]{1,160}$/.test(usbPath)) continue;
        const old = devices.get(id + ":" + serial);
        if (old && old.path !== usbPath) old.ambiguous = true;
        else
            devices.set(id + ":" + serial, {
                id,
                serial,
                path: usbPath,
                key: id + ":" + serial,
                layout: line.match(/name="([^"]+)"/)?.[1],
            });
    }
    return [...devices.values()].filter((d) => !d.ambiguous);
}

export function runDfu(exe: string, args: string[], onData = (_line: string) => {}, timeout = 180000): Promise<any> {
    return new Promise((resolve, reject) => {
        const child = spawn(exe, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let output = "",
            timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeout);
        const consume = (data: Buffer) => {
            const text = data.toString();
            output = (output + text).slice(-64000);
            onData(text);
        };
        child.stdout.on("data", consume);
        child.stderr.on("data", consume);
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code, output, timedOut });
        });
    });
}

export class BatchFlasher {
    state: any = {
        running: false,
        active: 0,
        firmware: null,
        error: "",
        resetting: false,
        slots: Array.from({ length: 5 }, (_, index) => ({
            index,
            serial: "",
            progress: 0,
            status: "等待设备",
            logs: [],
            result: "idle",
        })),
    };
    private generation = 0;
    private seen = new Set<string>();
    private busy = false;
    private selecting = false;
    private firmwarePath = "";
    private timer: any;
    constructor(
        private exe: string,
        private cache: string,
        private runner = runDfu,
    ) {}
    snapshot() {
        return structuredClone(this.state);
    }
    async select(file: string, supplied?: Buffer, source = "本地固件") {
        if (this.state.running || this.state.active || this.selecting || this.state.resetting)
            throw new Error("请等待当前批次结束");
        const generation = this.generation;
        this.selecting = true;
        try {
            const data = supplied ?? (await readFile(file));
            if (data.length > 8 * 1024 * 1024) throw new Error("固件文件过大");
            const binary = firmwareBinary(data, path.extname(file).toLowerCase());
            await mkdir(this.cache, { recursive: true });
            this.firmwarePath = path.join(this.cache, "batch-firmware.bin");
            await writeFile(this.firmwarePath, binary);
            if (generation !== this.generation) throw new Error("面板已关闭，请重新选择固件");
            this.state.firmware = {
                name: path.basename(file),
                source,
                bytes: binary.length,
                sha256: createHash("sha256").update(binary).digest("hex"),
            };
            this.seen.clear();
            this.state.error = "";
            return this.snapshot();
        } finally {
            this.selecting = false;
            if (this.state.resetting && !this.state.active) this.clear();
        }
    }
    start(confirmed: boolean) {
        if (this.selecting || !this.state.firmware || confirmed !== true)
            throw new Error("请选择固件并确认同品牌、同型号、同固件");
        if (this.state.running || this.state.active || this.state.resetting) throw new Error("当前批次尚未结束");
        this.state.running = true;
        this.state.error = "";
        this.timer = setInterval(() => void this.scan(), 1200);
        void this.scan();
        return this.snapshot();
    }
    stop() {
        this.state.running = false;
        clearInterval(this.timer);
        return this.snapshot();
    }
    reset() {
        this.stop();
        this.generation++;
        this.state.resetting = true;
        if (!this.state.active && !this.selecting) this.clear();
        return this.snapshot();
    }
    private clear() {
        this.seen.clear();
        this.state.firmware = null;
        this.firmwarePath = "";
        this.state.error = "";
        this.state.resetting = false;
        this.state.slots = this.state.slots.map((slot: any) => ({
            index: slot.index,
            serial: "",
            progress: 0,
            status: "等待设备",
            logs: [],
            result: "idle",
        }));
    }
    async scan() {
        if (this.busy || !this.state.running) return;
        this.busy = true;
        const generation = this.generation;
        try {
            const response = await this.runner(this.exe, ["-l"], undefined, 5000);
            if (response.code !== 0 || response.timedOut)
                throw new Error("DFU 扫描失败，请检查设备和 WinUSB 驱动：" + response.output.slice(-500));
            if (generation !== this.generation) return;
            this.state.error = "";
            const devices = parseDevices(response.output);
            // A completed device is retried only after an explicit reset or firmware selection.
            for (const device of devices) {
                if (!this.state.running || this.seen.has(device.key)) continue;
                const slot = this.state.slots.find((s: any) => s.result !== "busy");
                if (!slot) break;
                this.seen.add(device.key);
                void this.flash(slot, device);
            }
        } catch (error) {
            if (generation === this.generation) this.state.error = String(error);
        } finally {
            this.busy = false;
        }
    }
    private async flash(slot: any, device: any) {
        Object.assign(slot, { serial: device.serial, progress: 0, status: "擦除并写入中", logs: [], result: "busy" });
        this.state.active++;
        let temp = "";
        const started = Date.now();
        slot.timings = {};
        try {
            const layout = flashLayout(device.layout);
            if (this.state.firmware.bytes > layout.bytes) throw new Error("固件超出该设备内部 Flash 容量，未写入");
            temp = await mkdtemp(path.join(this.cache, "verify-"));
            const expected = await readFile(this.firmwarePath);
            const plan = dfusePlan(expected, device.layout, device.id);
            let downloadFile = this.firmwarePath;
            if (plan) {
                downloadFile = path.join(temp, "page-plan.dfu");
                await writeFile(downloadFile, plan.file);
                slot.logs.push(
                    `按 ${plan.elements} 个擦除页写入，省去 ${plan.skippedBytes} 字节空白传输；仍完整校验 ${expected.length} 字节`,
                );
            }
            const appendLog = (text: string) => {
                slot.logs.push(...text.split(/[\r\n]+/).filter(Boolean));
                slot.logs = slot.logs.slice(-100);
            };
            const progress = new BatchProgress(plan?.elements ?? 0, (phase, percent) => {
                slot.status = phase;
                slot.progress = Math.max(slot.progress, Math.min(70, percent));
            });
            const writingStarted = Date.now();
            const response = await this.runner(
                this.exe,
                [
                    "-d",
                    device.id,
                    "-S",
                    device.serial,
                    "-p",
                    device.path,
                    "-a",
                    "0",
                    "-D",
                    downloadFile,
                    ...(plan ? [] : ["-s", "0x08000000"]),
                ],
                (text: string) => {
                    appendLog(text);
                    progress.consume(text);
                },
            );
            slot.timings.eraseAndWriteMs = Date.now() - writingStarted;
            if (response.code !== 0 || response.timedOut)
                throw new Error(response.timedOut ? "烧录超时，请检查设备" : "烧录失败，退出码 " + response.code);
            slot.status = "读取 Flash 并逐字节校验";
            slot.progress = 70;
            const verifyingStarted = Date.now();
            const verifyFile = path.join(temp, "verify.bin");
            const selectors = ["-d", device.id, "-S", device.serial, "-p", device.path, "-a", "0"];
            const readback = await this.runner(
                this.exe,
                [...selectors, "-s", `0x08000000:${this.state.firmware.bytes}`, "-U", verifyFile],
                (text: string) => {
                    appendLog(text);
                    const percent = [...text.matchAll(/(\d+)%/g)].at(-1);
                    if (percent)
                        slot.progress = Math.max(
                            slot.progress,
                            70 + Math.min(29, Math.floor(Number(percent[1]) * 0.29)),
                        );
                },
            );
            if (readback.code !== 0 || readback.timedOut)
                throw new Error("写后读取校验失败：" + readback.output.slice(-800));
            const actual = await readFile(verifyFile);
            if (!expected.equals(actual)) throw new Error("读回数据与固件不一致（包括配置区域），请勿视为烧录成功");
            slot.timings.verifyMs = Date.now() - verifyingStarted;
            slot.logs.push("完整读回校验一致，SHA-256: " + createHash("sha256").update(actual).digest("hex"));
            slot.status = "写入并校验完成，正在退出 DFU";
            const leavingStarted = Date.now();
            const leave = await this.runner(
                this.exe,
                [...selectors, "-s", ":leave"],
                (text: string) => slot.logs.push(...text.split(/[\r\n]+/).filter(Boolean)),
                15000,
            );
            slot.progress = 100;
            slot.timings.leaveMs = Date.now() - leavingStarted;
            slot.result = leave.code === 0 && !leave.timedOut ? "success" : "warning";
            slot.status = slot.result === "success" ? "写入并校验完成" : "写入校验成功；退出 DFU 未确认，请手动重插";
        } catch (error) {
            slot.result = "error";
            slot.status = String(error);
            slot.logs.push(String(error));
        } finally {
            slot.timings.totalMs = Date.now() - started;
            slot.logs.push(
                `用时：擦除及写入 ${((slot.timings.eraseAndWriteMs ?? 0) / 1000).toFixed(1)} 秒，完整校验 ${((slot.timings.verifyMs ?? 0) / 1000).toFixed(1)} 秒，总计 ${(slot.timings.totalMs / 1000).toFixed(1)} 秒`,
            );
            await appendFile(
                path.join(this.cache, "device-logs.ndjson"),
                JSON.stringify({ at: new Date().toISOString(), device, ...slot }) + "\n",
            ).catch(() => {});
            if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {});
            this.state.active--;
            if (!this.state.active && this.state.resetting) this.clear();
        }
    }
}
