import { app, BrowserWindow, dialog, clipboard, ipcMain, Menu, session, shell } from "electron";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { fetchOfficial } from "./official-network";
import { loadChannelVideos } from "./bilibili";
import { DfuBackup } from "./dfu-backup";
import { AppUpdates } from "./app-updates";
import { BatchFlasher } from "./batch-flash";

app.setName("空致 KONz");
if (process.env.FPVFIX_QA_PROFILE) app.setPath("userData", process.env.FPVFIX_QA_PROFILE);
const primary = app.requestSingleInstanceLock();
let origin = "";
let mainWindow: BrowserWindow;
let nextId = 1;
const pending = new Map<number, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>();
const root = app.getAppPath();
const userDir = app.getPath("userData");
const helperRoot = path.join(process.resourcesPath, "network");
const appRoot = path.join(root, "website");
const logFile = path.join(userDir, "network.log");
let helper: ReturnType<typeof spawn>;
const batch = new BatchFlasher(path.join(process.resourcesPath, "dfu", "dfu-util.exe"), path.join(userDir, "batch"));
const backup = new DfuBackup(path.join(process.resourcesPath, "dfu", "dfu-util.exe"));
const updates = new AppUpdates(path.join(userDir, "updates"), helperNetwork);
let singleFlashBusy = false;
let directMode = false;
let routeRevision = 0;
let manualRoute = 1;
const routePreferenceFile = path.join(userDir, "route-preference.json");

function log(text: string) {
    appendFileSync(logFile, new Date().toISOString() + " " + text + "\n");
}

async function network(job: any): Promise<any> {
    const revision = routeRevision;
    if (job?.action === "select") {
        if (![0, 1, 2, 3].includes(job.routeId)) throw new Error("Invalid route");
        routeRevision++;
        directMode = job.routeId === 0;
        manualRoute = job.routeId;
        await writeFile(routePreferenceFile, JSON.stringify({ direct: directMode }));
    }
    if (job?.action) {
        let reply = await helperNetwork(directMode ? { action: "status" } : job);
        // A manual selection made during a probe wins over its measured result.
        if (job.action === "probe" && revision !== routeRevision && !directMode)
            reply = await helperNetwork({ action: "select", routeId: manualRoute });
        if (directMode) reply.routeState.selected = 0;
        return reply;
    }
    if (directMode) return fetchOfficial(job, session.defaultSession.fetch.bind(session.defaultSession));
    return helperNetwork(job);
}

function helperNetwork(job: any) {
    const control = ["probe", "select", "status"].includes(job?.action);
    const download = job?.action === "update-download";
    if (
        !job ||
        (!control &&
            !download &&
            (typeof job.path !== "string" ||
                job.path.length > 1200 ||
                !/^\/(?:build\/api\/|presets\/|github\/betaflight\/firmware-presets\/|updates\/latest$|health$)/.test(
                    job.path,
                ) ||
                !["GET", "POST"].includes(job.method || "GET") ||
                (job.body?.length || 0) > (/^\/build\/api\/support(?:\/|$)/.test(job.path) ? 1400000 : 45000))) ||
        (control && job.action === "select" && ![1, 2, 3].includes(job.routeId))
    ) {
        return Promise.reject(new Error("Invalid network request"));
    }
    const id = nextId++;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(job.headers || {})) {
        if (["authorization", "content-type", "x-cfg-ver"].includes(key.toLowerCase()) && typeof value === "string")
            headers[key] = value;
    }
    return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
            () => {
                pending.delete(id);
                reject(new Error("CF connection timed out"));
            },
            download ? 900000 : 180000,
        );
        pending.set(id, { resolve, reject, timer });
        helper.stdin!.write(
            JSON.stringify({
                id,
                action: control || download ? job.action : undefined,
                file: download ? job.file : undefined,
                bytes: download ? job.bytes : undefined,
                sha256: download ? job.sha256 : undefined,
                routeId: job.routeId,
                path: job.path,
                method: job.method || "GET",
                headers,
                body: job.body,
            }) + "\n",
        );
    });
}

async function chooseDevice(
    items: any[],
    label: (item: any) => string,
    id: (item: any) => string,
    callback: (value: string) => void,
) {
    if (items.length === 1) {
        callback(id(items[0]));
        return;
    }
    if (!items.length) {
        callback("");
        return;
    }
    const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "空致 KONz — 选择飞控设备",
        message: "请选择要连接的设备",
        buttons: [...items.slice(0, 12).map(label), "取消"],
        cancelId: Math.min(items.length, 12),
        noLink: true,
    });
    callback(result.response < Math.min(items.length, 12) ? id(items[result.response]) : "");
}

app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});
if (primary)
    app.whenReady()
        .then(async () => {
            await mkdir(userDir, { recursive: true });
            try {
                directMode = JSON.parse(await readFile(routePreferenceFile, "utf8")).direct === true;
            } catch {
                /* First launch uses automatic CF selection. */
            }
            helper = spawn(path.join(helperRoot, "fpvfix-network.exe"), [path.join(userDir, "cf-config.json")], {
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"],
            });
            helper.on("error", (error) => log("helper: " + error.message));
            helper.stderr!.on("data", (chunk) => log(String(chunk).slice(0, 2000)));
            helper.on("exit", () => {
                for (const task of pending.values()) {
                    clearTimeout(task.timer);
                    task.reject(new Error("CF helper stopped"));
                }
                pending.clear();
            });
            createInterface({ input: helper.stdout! }).on("line", (line) => {
                try {
                    const reply = JSON.parse(line);
                    const task = pending.get(reply.id);
                    if (!task) return;
                    if (typeof reply.progress === "number") {
                        updates.state.progress = reply.progress;
                        return;
                    }
                    clearTimeout(task.timer);
                    pending.delete(reply.id);
                    log(
                        `request ${reply.id}: ${reply.error ? "error" : reply.status || "routes"} ${reply.seconds}s ${reply.routeId ? `line${reply.routeId}` : ""} ${reply.error || ""}`,
                    );
                    if (reply.error) task.reject(new Error(reply.error));
                    else task.resolve(reply);
                } catch (error) {
                    log("invalid helper response");
                }
            });
            const types: Record<string, string> = {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".woff": "font/woff",
                ".woff2": "font/woff2",
                ".wasm": "application/wasm",
            };
            const server = createServer(async (req, res) => {
                try {
                    if (req.headers.host !== new URL(origin).host || !["GET", "HEAD"].includes(req.method || "")) {
                        res.writeHead(403).end();
                        return;
                    }
                    const url = new URL(req.url!, origin);
                    if (url.pathname === "/build-api.php") {
                        const reply = await network({ path: "/build" + (url.searchParams.get("path") || "") });
                        res.writeHead(reply.status, {
                            ...reply.headers,
                            "Cache-Control": "no-store",
                            "X-Content-Type-Options": "nosniff",
                        });
                        res.end(req.method === "HEAD" ? undefined : Buffer.from(reply.body, "base64"));
                        return;
                    }
                    const name = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
                    const file = path.resolve(appRoot, "." + name);
                    const relative = path.relative(appRoot, file);
                    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
                        res.writeHead(403).end();
                        return;
                    }
                    const data = await readFile(file);
                    res.writeHead(200, {
                        "Content-Type": types[path.extname(file)] || "application/octet-stream",
                        "Cache-Control": "no-store",
                        "X-Content-Type-Options": "nosniff",
                    });
                    res.end(req.method === "HEAD" ? undefined : data);
                } catch {
                    res.writeHead(404).end("Not found");
                }
            });
            // A stable origin keeps settings, cached firmware, and device permissions across launches.
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(process.env.FPVFIX_QA_PROFILE ? 49540 : 49539, "127.0.0.1", resolve);
            });
            origin = "http://127.0.0.1:" + (server.address() as any).port;
            ipcMain.handle("fpvfix:routes", (event, job) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted request");
                if (!["probe", "select", "status"].includes(job?.action)) throw new Error("Invalid route action");
                return network({ action: job.action, routeId: job.routeId }).then((reply) => reply.routeState);
            });
            ipcMain.handle("fpvfix:network", (event, job) => {
                if (
                    event.senderFrame?.url &&
                    new URL(event.senderFrame.url).origin === origin &&
                    event.sender === mainWindow.webContents
                )
                    return job?.action === "update-download"
                        ? Promise.reject(new Error("Unsupported renderer action"))
                        : network(job);
                throw new Error("Untrusted request");
            });
            ipcMain.handle("fpvfix:updates", async (event, job) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted updates request");
                if (job?.action === "status") return updates.snapshot();
                if (job?.action === "check") return updates.check();
                if (job?.action === "acknowledge") return updates.acknowledge();
                if (job?.action === "download")
                    return updates.download(job.kind, async (name) => {
                        const result = await dialog.showSaveDialog(mainWindow, {
                            title: "保存软件更新包",
                            defaultPath: name,
                            filters: [{ name: "软件更新包", extensions: [name.endsWith(".zip") ? "zip" : "exe"] }],
                        });
                        return result.canceled ? undefined : result.filePath;
                    });
                throw new Error("Invalid update action");
            });
            ipcMain.handle("fpvfix:batch", async (event, job) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted batch request");
                if (job?.action === "status") return { ...batch.snapshot(), backupBusy: backup.state.busy };
                if (job?.action === "reset") return batch.reset();
                if (backup.state.busy || singleFlashBusy) throw new Error("请等待固件备份或单台烧录结束");
                if (job?.action === "stop") return batch.stop();
                if (job?.action === "start") return batch.start(job.confirmed);
                if (job?.action === "online") {
                    if (
                        typeof job.hex !== "string" ||
                        job.hex.length > 8 * 1024 * 1024 ||
                        typeof job.name !== "string" ||
                        job.name.length > 240 ||
                        !/\.hex$/i.test(job.name)
                    )
                        throw new Error("在线固件无效，请先完成 HEX 编译和加载");
                    return batch.select(path.basename(job.name), Buffer.from(job.hex, "utf8"), "在线编译固件");
                }
                if (job?.action === "select") {
                    if (batch.state.running || batch.state.active) throw new Error("请先停止批量烧录并等待任务结束");
                    const result = await dialog.showOpenDialog(mainWindow, {
                        title: "选择同批次飞控固件",
                        properties: ["openFile"],
                        filters: [{ name: "飞控固件", extensions: ["hex", "bin"] }],
                    });
                    if (result.canceled) return batch.snapshot();
                    return batch.select(result.filePaths[0]);
                }
                throw new Error("Invalid batch action");
            });
            ipcMain.handle("fpvfix:backup", async (event, job) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted backup request");
                if (job?.action === "status") return backup.snapshot();
                if (backup.state.busy || batch.state.running || batch.state.active || singleFlashBusy)
                    throw new Error("请先结束烧录或备份任务");
                if (job?.action === "scan") return backup.devices();
                if (job?.action !== "save" || typeof job.key !== "string") throw new Error("Invalid backup action");
                Object.assign(backup.state, {
                    busy: true,
                    progress: 0,
                    error: "",
                    savedPath: "",
                    sha256: "",
                    status: "准备读取",
                });
                try {
                    const result = await backup.read(job.key);
                    const save = await dialog.showSaveDialog(mainWindow, {
                        title: "保存完整内部 Flash HEX 备份",
                        defaultPath: "DFU-" + result.serial + "-" + Date.now() + ".hex",
                        filters: [{ name: "Intel HEX", extensions: ["hex"] }],
                    });
                    if (save.canceled || !save.filePath) backup.state.status = "已取消保存";
                    else {
                        await writeFile(save.filePath, result.hex, "utf8");
                        backup.state.savedPath = save.filePath;
                        backup.state.status = "HEX 备份已保存，两次读取一致";
                    }
                } catch (error) {
                    backup.state.error = String(error);
                    backup.state.status = "备份失败";
                } finally {
                    backup.state.busy = false;
                }
                return backup.snapshot();
            });
            ipcMain.handle("fpvfix:copy-group", (event) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted clipboard request");
                clipboard.writeText("1075517252");
                return true;
            });
            ipcMain.on("fpvfix:single-flash-busy", (event, busy) => {
                if (
                    event.sender === mainWindow.webContents &&
                    new URL(event.senderFrame?.url || "about:blank").origin === origin
                )
                    singleFlashBusy = busy === true;
            });
            const refresh = () => {
                if (batch.state.running || batch.state.active || singleFlashBusy || backup.state.busy) {
                    void dialog.showMessageBox(mainWindow, {
                        type: "info",
                        message: "自动烧录或固件备份进行中，请停止并等待任务结束后再刷新。",
                    });
                    return false;
                }
                mainWindow.webContents.reload();
                return true;
            };
            ipcMain.handle("fpvfix:refresh", (event) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted refresh request");
                return refresh();
            });
            const ses = session.defaultSession;
            ipcMain.handle("fpvfix:videos", (event) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted video request");
                return loadChannelVideos(ses.fetch.bind(ses), path.join(userDir, "channel-videos.json"));
            });
            const locationSession = session.fromPartition("konz-direct-location", { cache: false });
            await locationSession.setProxy({ mode: "direct" });
            ipcMain.handle("fpvfix:location", async (event, job) => {
                if (
                    event.sender !== mainWindow.webContents ||
                    new URL(event.senderFrame?.url || "about:blank").origin !== origin
                )
                    throw new Error("Untrusted location request");
                if (job?.source === "system") {
                    return new Promise((resolve) => {
                        const script =
                            "Add-Type -AssemblyName System.Device; $watcher = New-Object System.Device.Location.GeoCoordinateWatcher; try { if ($watcher.TryStart($false, [TimeSpan]::FromSeconds(8)) -and !$watcher.Position.Location.IsUnknown) { $point = $watcher.Position.Location; @{latitude=$point.Latitude;longitude=$point.Longitude;accuracy=$point.HorizontalAccuracy} | ConvertTo-Json -Compress } else { '{}' } } finally { $watcher.Dispose() }";
                        execFile(
                            path.join(
                                process.env.SystemRoot || "C:\\Windows",
                                "System32/WindowsPowerShell/v1.0/powershell.exe",
                            ),
                            ["-NoProfile", "-NonInteractive", "-Command", script],
                            { windowsHide: true, timeout: 12000 },
                            (error, stdout) => {
                                try {
                                    resolve(error ? null : JSON.parse(stdout));
                                } catch {
                                    resolve(null);
                                }
                            },
                        );
                    });
                }
                if (job?.source !== "ip") throw new Error("Invalid location source");
                const reply = await locationSession.fetch("https://get.geojs.io/v1/ip/geo.json", {
                    signal: AbortSignal.timeout(8000),
                });
                if (!reply.ok) throw new Error("IP location unavailable");
                const data = await reply.json();
                const latitude = Number(data.latitude),
                    longitude = Number(data.longitude);
                if (
                    !Number.isFinite(latitude) ||
                    !Number.isFinite(longitude) ||
                    Math.abs(latitude) > 90 ||
                    Math.abs(longitude) > 180
                )
                    throw new Error("Invalid location");
                return { latitude, longitude };
            });
            const isLocal = (url: string) => {
                try {
                    return new URL(url).origin === origin;
                } catch {
                    return false;
                }
            };
            ses.setPermissionCheckHandler(
                (_contents, permission, requestingOrigin) =>
                    isLocal(requestingOrigin) &&
                    ["serial", "usb", "bluetooth", "fileSystem", "geolocation"].includes(permission),
            );
            ses.setPermissionRequestHandler((contents, permission, callback) =>
                callback(
                    isLocal(contents.getURL()) &&
                        ["serial", "usb", "bluetooth", "fileSystem", "geolocation"].includes(permission),
                ),
            );
            ses.setDevicePermissionHandler(
                (details) => isLocal(details.origin) && ["serial", "usb"].includes(details.deviceType),
            );
            ses.on("select-serial-port", (event, ports, contents, callback) => {
                event.preventDefault();
                if (!isLocal(contents.getURL())) return callback("");
                void chooseDevice(
                    ports,
                    (port) => `${port.displayName || port.portName} (${port.portName})`,
                    (port) => port.portId,
                    callback,
                );
            });
            ses.on("select-usb-device", (event, details, callback) => {
                event.preventDefault();
                if (!isLocal(details.frame?.url || "")) return callback("");
                void chooseDevice(
                    details.deviceList,
                    (device) => `${device.productName || "USB device"} (${device.vendorId}:${device.productId})`,
                    (device) => device.deviceId,
                    callback,
                );
            });
            mainWindow = new BrowserWindow({
                title: "空致 KONz",
                width: 1360,
                height: 900,
                minWidth: 1050,
                minHeight: 650,
                icon: path.join(root, "icon.png"),
                webPreferences: {
                    preload: path.join(root, "preload.cjs"),
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                },
            });
            mainWindow.webContents.on("will-navigate", (event, url) => {
                if (!isLocal(url)) {
                    event.preventDefault();
                    if (url.startsWith("https://")) void shell.openExternal(url);
                }
            });
            mainWindow.webContents.setWindowOpenHandler(({ url }) => {
                if (isLocal(url))
                    return {
                        action: "allow",
                        overrideBrowserWindowOptions: {
                            webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
                        },
                    };
                if (url.startsWith("https://")) void shell.openExternal(url);
                return { action: "deny" };
            });
            Menu.setApplicationMenu(null);
            mainWindow.webContents.on("before-input-event", (event, input) => {
                if (input.type !== "keyDown") return;
                if (input.key === "F5") {
                    event.preventDefault();
                    refresh();
                } else if (input.control && !input.alt && !input.shift && input.key.toLowerCase() === "o") {
                    event.preventDefault();
                    mainWindow.webContents.setZoomFactor(1);
                    void mainWindow.webContents
                        .executeJavaScript('window.dispatchEvent(new Event("konz-reset-scale"))')
                        .catch((error) => log(String(error)));
                }
            });
            mainWindow.on("close", (event) => {
                if (batch.state.active || backup.state.busy) {
                    event.preventDefault();
                    batch.stop();
                    void dialog.showMessageBox(mainWindow, {
                        type: "info",
                        message: "请等待烧录或备份完成后再退出。",
                    });
                } else batch.stop();
            });
            mainWindow.webContents.on("render-process-gone", (_event, details) =>
                log("renderer: " + JSON.stringify(details)),
            );
            mainWindow.webContents.on("console-message", (event) => {
                if (event.level === "error") log("renderer: " + event.message);
            });
            await mainWindow.loadURL(origin);
            if (process.env.FPVFIX_SELFTEST === "1") {
                setTimeout(async () => {
                    const result: any = { origin };
                    try {
                        result.ui = await mainWindow.webContents.executeJavaScript(
                            `({title:document.title,text:document.body.innerText.slice(0,3000),serial:!!navigator.serial,usb:!!navigator.usb,secure:isSecureContext,desktop:!!window.fpvfixDesktop})`,
                        );
                        result.rendererFetch = await mainWindow.webContents.executeJavaScript(
                            `fetch('./build-api.php?path=/api/options/2026.6.2').then(async r=>({status:r.status,route:r.headers.get('x-fpvfix-route'),keys:Object.keys(await r.json())}))`,
                        );
                        result.stored = await mainWindow.webContents.executeJavaScript(
                            `(()=>{const previous=localStorage.getItem('fpvfix-selftest');localStorage.setItem('fpvfix-selftest','persistent');return previous;})()`,
                        );
                        for (const endpoint of ["/health", "/build/api/options/2026.6.2", "/presets/index.json"]) {
                            const response = await network({ path: endpoint });
                            const body = Buffer.from(response.body, "base64");
                            result[endpoint] = {
                                status: response.status,
                                bytes: body.length,
                                keys: Object.keys(JSON.parse(body.toString())),
                            };
                        }
                        await writeFile(
                            path.join(userDir, "selftest.png"),
                            (await mainWindow.webContents.capturePage()).toPNG(),
                        );
                    } catch (error) {
                        result.error = String(error);
                    }
                    await writeFile(path.join(userDir, "selftest.json"), JSON.stringify(result, null, 2));
                    app.quit();
                }, 6000);
            }
            app.on("before-quit", (event) => {
                if (batch.state.active || backup.state.busy) {
                    event.preventDefault();
                    batch.stop();
                    return;
                }
                batch.stop();
                server.close();
                helper.kill();
            });
        })
        .catch((error) => {
            dialog.showErrorBox("空致 KONz 启动失败", String(error));
            app.quit();
        });
else app.quit();
app.on("window-all-closed", () => app.quit());
