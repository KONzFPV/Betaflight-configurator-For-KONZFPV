import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const source = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(source);
const [toolsDir, electronDir, helperDir, outputDir] = process.argv.slice(2).map((x) => path.resolve(x));
if (!outputDir)
    throw new Error("Usage: node desktop/package.mjs <tools-dir> <electron-runtime-dir> <helper-dir> <output-dir>");
const { build } = await import(pathToFileURL(path.join(toolsDir, "node_modules/esbuild/lib/main.js")));
const stage = path.join(outputDir, "app-source");
if (path.dirname(stage) !== outputDir) throw new Error("Invalid staging directory");
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
await fs.mkdir(path.join(stage, "node_modules"), { recursive: true });
await fs.cp(path.join(repo, "src/dist"), path.join(stage, "website"), { recursive: true });
await fs.copyFile(path.join(repo, "LICENSE"), path.join(stage, "LICENSE"));
await fs.copyFile(path.join(source, "icon.png"), path.join(stage, "icon.png"));
await fs.copyFile(path.join(source, "README.md"), path.join(stage, "BUILD-NOTES.md"));
await fs.cp(path.join(source, "licenses"), path.join(stage, "third-party-licenses"), { recursive: true });
await build({
    entryPoints: [path.join(source, "main.ts")],
    outfile: path.join(stage, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    target: "node24",
});
await build({
    entryPoints: [path.join(source, "preload.ts")],
    outfile: path.join(stage, "preload.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    target: "node24",
});
await fs.writeFile(
    path.join(stage, "package.json"),
    JSON.stringify(
        {
            name: "konz-configurator",
            productName: "空致 KONz",
            version: "2026.6.2",
            main: "main.cjs",
            description: "空致 KONz Betaflight desktop configurator",
            author: "KONz; based on the Betaflight contributors",
            license: "GPL-3.0",
            packageManager: "pnpm@11.25.0",
        },
        null,
        2,
    ),
);
const { build: packageApp } = await import(
    pathToFileURL(path.join(toolsDir, "node_modules/electron-builder/out/index.js"))
);
await packageApp({
    projectDir: stage,
    config: {
        appId: "com.konz.configurator",
        productName: "空致 KONz",
        electronVersion: "45.1.0",
        buildVersion: "2026.6.2.12",
        electronDist: electronDir,
        electronLanguages: ["en-US", "zh-CN"],
        npmRebuild: false,
        beforeBuild: () => false,
        directories: { output: path.join(outputDir, "release") },
        asar: true,
        files: ["**/*"],
        extraResources: [
            { from: helperDir, to: "network", filter: ["**/*"] },
            { from: path.join(source, "dfu"), to: "dfu", filter: ["**/*"] },
        ],
        extraFiles: [{ from: path.join(source, "使用说明.txt"), to: "使用说明.txt" }],
        win: {
            target: [
                { target: "zip", arch: ["x64"] },
                { target: "nsis", arch: ["x64"] },
            ],
            icon: path.join(source, "icon.ico"),
            signExecutable: false,
            artifactName: "KONz-${version}-Preview10-Windows-${arch}.${ext}",
        },
        nsis: {
            artifactName: "KONz-${version}-Preview10-Setup-${arch}.${ext}",
            oneClick: false,
            perMachine: false,
            allowToChangeInstallationDirectory: true,
            createDesktopShortcut: true,
            runAfterFinish: false,
            deleteAppDataOnUninstall: false,
        },
        publish: null,
    },
});
