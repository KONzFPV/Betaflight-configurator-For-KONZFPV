import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [firmware, config] = process.argv.slice(2).map((value) => path.resolve(value));
if (!firmware || !config) throw new Error("Provide official firmware and config source folders");
async function readTree(root, dir = root) {
    const result = [];
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) result.push(...await readTree(root, full));
        else if (/\.(?:c|h|mk)$/.test(item.name)) result.push({ file: path.relative(root, full).replaceAll("\\", "/"), text: await fs.readFile(full, "utf8") });
    }
    return result;
}
const source = [...await readTree(firmware, path.join(firmware, "src")), ...await readTree(firmware, path.join(firmware, "mk"))];
const boards = await readTree(config, path.join(config, "configs"));
const code = (await fs.readFile(path.join(repo, "src/utils/hardwareBuildOptions.ts"), "utf8")).split("export function normalizedDefine")[0];
const flags = [...new Set(code.match(/USE_[A-Z0-9_]+/g))];
const evidence = {};
for (const flag of flags) {
    const pattern = new RegExp(`\\b${flag}\\b`);
    const references = source.filter((item) => pattern.test(item.text));
    if (!references.length) throw new Error(`Unsupported official macro: ${flag}`);
    const configs = boards.filter((item) => new RegExp(`^\\s*#\\s*define\\s+${flag}\\b`, "m").test(item.text));
    const driver = references.find((item) => item.file.includes("/drivers/")) || references[0];
    evidence[flag] = {
        firmware: `https://github.com/betaflight/betaflight/blob/2026.6.2/${driver.file}`,
        file: driver.file,
        config: configs[0] ? `https://github.com/betaflight/config/blob/3a406c5c30c20d7c3bc7dd5ed547cca961baf0a9/${configs[0].file}` : null,
        configCount: configs.length,
        examples: configs.slice(0, 3).map((item) => item.file),
    };
}
await fs.writeFile(path.join(repo, "src/data/hardwareEvidence.json"), JSON.stringify({ firmwareVersion: "2026.6.2", configCommit: "3a406c5c30c20d7c3bc7dd5ed547cca961baf0a9", flags: evidence }, null, 2));
console.log(`Verified ${flags.length} driver macros against official firmware; ${Object.values(evidence).filter((item) => item.config).length} have config.h examples.`);
