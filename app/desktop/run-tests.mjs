import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const tools = process.argv[2];
const { build } = tools
    ? await import(pathToFileURL(path.resolve(tools, "node_modules/esbuild/lib/main.js")))
    : await import("esbuild");
const output = await fs.mkdtemp(path.join(os.tmpdir(), "konz-desktop-tests-"));
try {
    for (const [name, variable] of [
        ["batch-flash", "KONZ_BATCH_MODULE"],
        ["dfu-backup", "KONZ_BACKUP_MODULE"],
        ["app-updates", "KONZ_UPDATES_MODULE"],
        ["dfuse-plan", "KONZ_PLAN_MODULE"],
    ]) {
        const file = path.join(output, name + ".mjs");
        await build({
            entryPoints: [path.join(import.meta.dirname, name + ".ts")],
            outfile: file,
            bundle: true,
            platform: "node",
            format: "esm",
            target: "node24",
        });
        process.env[variable] = pathToFileURL(file).href;
    }
    const tests = ["test-batch-flash.mjs", "test-dfu-backup.mjs", "test-app-updates.mjs", "test-dfuse-plan.mjs"].map(
        (file) => path.join(import.meta.dirname, file),
    );
    const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit", env: process.env });
    process.exitCode = result.status ?? 1;
} finally {
    await fs.rm(output, { recursive: true, force: true });
}
