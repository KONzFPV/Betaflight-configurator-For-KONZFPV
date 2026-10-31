import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
    "fpvfixDesktop",
    Object.freeze({
        refresh: () => ipcRenderer.invoke("fpvfix:refresh"),
        setFlashingBusy: (busy: boolean) => ipcRenderer.send("fpvfix:single-flash-busy", busy),
        copyGroup: () => ipcRenderer.invoke("fpvfix:copy-group"),
        backup: (job: unknown) => ipcRenderer.invoke("fpvfix:backup", job),
        batch: (job: unknown) => ipcRenderer.invoke("fpvfix:batch", job),
        updates: (job: unknown) => ipcRenderer.invoke("fpvfix:updates", job),
        version: "2026.6.2",
        routes: (job: unknown) => ipcRenderer.invoke("fpvfix:routes", job),
        locate: (job: unknown) => ipcRenderer.invoke("fpvfix:location", job),
        videos: () => ipcRenderer.invoke("fpvfix:videos"),
        request: (job: unknown) => ipcRenderer.invoke("fpvfix:network", job),
    }),
);
