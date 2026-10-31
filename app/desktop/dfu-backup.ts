import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseDevices, runDfu } from "./batch-flash";

import { flashLayout } from "./dfu-memory";
export { flashLayout } from "./dfu-memory";

export function backupDevices(output: string) {
    return parseDevices(output).map((device) => {
        const layouts = output
            .split(/\r?\n/)
            .filter(
                (line) =>
                    line.includes(`serial="${device.serial}"`) &&
                    line.includes(`path="${device.path}"`) &&
                    line.toLowerCase().includes(`[${device.id}]`) &&
                    /alt=0(?:,|\s)/.test(line),
            )
            .map((line) => line.match(/name="([^"]+)"/)?.[1] || "");
        if (!layouts.length || new Set(layouts).size !== 1) throw new Error("设备 Flash 描述不明确");
        return { ...device, family: device.id === "314b:0106" ? "APM32" : "STM32", ...flashLayout(layouts[0]) };
    });
}

export function intelHex(data: Buffer, address = 0x08000000) {
    const record = (offset: number, type: number, payload: number[]) => {
        const bytes = [payload.length, offset >> 8, offset & 255, type, ...payload];
        bytes.push(-bytes.reduce((a, b) => a + b, 0) & 255);
        return ":" + Buffer.from(bytes).toString("hex").toUpperCase();
    };
    const lines: string[] = [];
    let upper = -1;
    for (let offset = 0; offset < data.length;) {
        const absolute = address + offset,
            high = Math.floor(absolute / 65536),
            low = absolute & 65535;
        if (high !== upper) {
            lines.push(record(0, 4, [high >> 8, high & 255]));
            upper = high;
        }
        const size = Math.min(16, data.length - offset, 65536 - low);
        lines.push(record(low, 0, [...data.subarray(offset, offset + size)]));
        offset += size;
    }
    lines.push(record(0, 1, []));
    return lines.join("\r\n") + "\r\n";
}

export class DfuBackup {
    state = { busy: false, progress: 0, status: "待机", error: "", savedPath: "", sha256: "" };
    constructor(
        private exe: string,
        private runner = runDfu,
    ) {}
    snapshot() {
        return structuredClone(this.state);
    }
    async devices() {
        const result = await this.runner(this.exe, ["-l"], undefined, 10000);
        if (result.code !== 0 || result.timedOut) throw new Error("DFU 扫描失败，请检查 WinUSB 驱动");
        return backupDevices(result.output);
    }
    async read(key: string) {
        let temp = "";
        try {
            const device = (await this.devices()).find((d) => d.key === key);
            if (!device) throw new Error("设备已断开或无法唯一识别，请重新扫描");
            temp = await mkdtemp(path.join(os.tmpdir(), "konz-dfu-backup-"));
            const buffers: Buffer[] = [];
            for (let pass = 0; pass < 2; pass++) {
                this.state.status = pass ? "第二次读取并比对" : "第一次读取完整内部 Flash";
                const file = path.join(temp, `read-${pass}.bin`);
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
                        "-s",
                        `0x08000000:${device.bytes}`,
                        "-U",
                        file,
                    ],
                    (text: string) => {
                        const percentages = [...text.matchAll(/(\d+)%/g)];
                        if (percentages.length)
                            this.state.progress = pass * 50 + Math.min(49, Number(percentages.at(-1)![1]) / 2);
                    },
                    240000,
                );
                if (
                    response.code !== 0 ||
                    response.timedOut ||
                    /read.?protect|upload.*(fail|error)|error during upload/i.test(response.output)
                )
                    throw new Error("读取失败或设备开启读保护，已停止；不会解锁或擦除。" + response.output.slice(-800));
                const data = await readFile(file);
                if (data.length !== device.bytes) throw new Error("读取长度与内部 Flash 容量不符，未保存备份");
                buffers.push(data);
            }
            if (!buffers[0].equals(buffers[1])) throw new Error("两次读取内容不一致，未保存备份");
            this.state.sha256 = createHash("sha256").update(buffers[0]).digest("hex");
            this.state.progress = 100;
            this.state.status = "两次读取一致，等待保存 HEX";
            return { hex: intelHex(buffers[0]), serial: device.serial };
        } finally {
            if (temp) await rm(temp, { recursive: true, force: true });
        }
    }
}
