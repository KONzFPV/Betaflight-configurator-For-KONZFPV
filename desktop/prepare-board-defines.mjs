import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("Usage: node desktop/prepare-board-defines.mjs <official-config-repository>");
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configs = {};
async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.name === "config.h") {
            const bytes = await fs.readFile(file);
            const hash = `sha256_${crypto.createHash("sha256").update(bytes).digest("hex")}`;
            const text = bytes
                .toString("utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/[^\r\n]*/g, "");
            let depth = 0;
            const flags = [];
            for (const line of text.split(/\r?\n/)) {
                if (/^\s*#\s*(?:if|ifdef|ifndef)\b/.test(line)) depth++;
                else if (/^\s*#\s*endif\b/.test(line)) depth--;
                else if (depth === 0) {
                    const match = line.match(/^\s*#\s*define\s+(USE_[A-Z0-9_]+)\s*$/);
                    if (match) flags.push(match[1]);
                }
            }
            configs[hash] = [...new Set(flags)].sort();
        }
    }
}
await visit(path.join(root, "configs"));
await fs.mkdir(path.join(repo, "src/data"), { recursive: true });
await fs.writeFile(
    path.join(repo, "src/data/boardHardwareDefines.json"),
    JSON.stringify({
        source: "https://github.com/betaflight/config/tree/3a406c5c30c20d7c3bc7dd5ed547cca961baf0a9",
        configs,
    }),
);
console.log(`Indexed ${Object.keys(configs).length} exact board configuration hashes`);
