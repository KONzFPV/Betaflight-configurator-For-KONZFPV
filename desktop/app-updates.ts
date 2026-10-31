import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { APP_RELEASE } from "./app-release";
export function validateRelease(value: any) {
    if (
        !value ||
        !Number.isSafeInteger(value.build) ||
        value.build < 1 ||
        typeof value.version !== "string" ||
        !/^[\w .-]{1,80}$/.test(value.version) ||
        typeof value.tag !== "string" ||
        !/^[\w.-]{1,100}$/.test(value.tag)
    )
        throw new Error("更新版本清单无效");
    if (!Array.isArray(value.packages) || value.packages.length < 1 || value.packages.length > 2)
        throw new Error("更新包清单无效");
    if (value.tag.includes("..")) throw new Error("更新标记无效");
    const seen = new Set();
    const packages = value.packages.map((item: any) => {
        if (
            !["portable", "installer"].includes(item.kind) ||
            seen.has(item.kind) ||
            typeof item.name !== "string" ||
            !/^[\w.-]{1,180}$/.test(item.name) ||
            !item.name.endsWith(item.kind === "portable" ? ".zip" : ".exe") ||
            !Number.isSafeInteger(item.bytes) ||
            item.bytes < 1 ||
            item.bytes > 1024 ** 3 ||
            !/^[a-f0-9]{64}$/i.test(item.sha256)
        )
            throw new Error("更新包格式、大小或校验值无效");
        if (item.name.includes("..")) throw new Error("更新包名称无效");
        seen.add(item.kind);
        return { kind: item.kind, name: item.name, bytes: item.bytes, sha256: item.sha256.toLowerCase() };
    });
    return {
        build: value.build,
        version: value.version,
        tag: value.tag,
        packages,
        notes: typeof value.notes === "string" ? value.notes.slice(0, 12000) : "",
    };
}
export class AppUpdates {
    state: any = {
        current: APP_RELEASE,
        status: "idle",
        release: null,
        error: "",
        notification: false,
        downloading: false,
        progress: 0,
        savedPath: "",
    };
    private checking = false;
    constructor(
        private directory: string,
        private request: (job: any) => Promise<any>,
    ) {}
    snapshot() {
        return structuredClone(this.state);
    }
    async check() {
        if (this.checking || this.state.downloading) return this.snapshot();
        this.checking = true;
        this.state.status = "checking";
        this.state.error = "";
        try {
            const reply = await this.request({ path: "/updates/latest", method: "GET" });
            if (reply.status === 204) {
                this.state.release = null;
                this.state.status = "unpublished";
                return this.snapshot();
            }
            if (reply.status !== 200)
                throw new Error(reply.status === 404 ? "更新线路尚未启用，请稍后重试" : "暂时无法检查更新");
            const data = Buffer.from(reply.body, "base64");
            if (data.length > 65536) throw new Error("更新清单过大");
            const release = validateRelease(JSON.parse(data.toString()));
            this.state.release = release;
            this.state.status = release.build > APP_RELEASE.build ? "available" : "current";
            if (this.state.status === "available") {
                let notified: number[] = [];
                try {
                    const value = JSON.parse(await readFile(path.join(this.directory, "notified.json"), "utf8"));
                    if (Array.isArray(value)) notified = value.filter(Number.isSafeInteger);
                } catch {}
                if (!notified.includes(release.build)) {
                    await mkdir(this.directory, { recursive: true });
                    notified.push(release.build);
                    await writeFile(path.join(this.directory, "notified.json"), JSON.stringify(notified));
                    this.state.notification = true;
                }
            }
        } catch (e) {
            this.state.status = "error";
            this.state.error = String(e);
        } finally {
            this.checking = false;
        }
        return this.snapshot();
    }
    acknowledge() {
        this.state.notification = false;
        return this.snapshot();
    }
    async download(kind: string, choose: (name: string) => Promise<string | undefined>) {
        if (this.state.downloading) throw new Error("正在下载更新包");
        const release = this.state.release;
        const item = release?.packages.find((p: any) => p.kind === kind);
        if (!item || this.state.status !== "available") throw new Error("该版本尚未提供所选更新包");
        this.state.downloading = true;
        this.state.progress = 0;
        this.state.error = "";
        this.state.savedPath = "";
        let temporary = "";
        try {
            const target = await choose(item.name);
            if (!target) return this.snapshot();
            temporary = target + ".konz-download.part";
            const reply = await this.request({
                action: "update-download",
                path: "/updates/download/" + release.tag + "/" + item.name,
                file: temporary,
                bytes: item.bytes,
                sha256: item.sha256,
            });
            if (!reply.saved) throw new Error("下载未完成校验");
            await rename(temporary, target);
            temporary = "";
            this.state.savedPath = target;
            this.state.progress = 100;
        } catch (e) {
            this.state.error = String(e);
        } finally {
            if (temporary) await rm(temporary, { force: true }).catch(() => {});
            this.state.downloading = false;
        }
        return this.snapshot();
    }
}
