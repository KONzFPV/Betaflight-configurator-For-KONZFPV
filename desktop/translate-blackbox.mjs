import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const folder = "src/blackbox-viewer/components";
const strings = new Set();
for (const file of await fs.readdir(folder)) {
    if (!file.endsWith(".vue")) continue;
    const code = await fs.readFile(path.join(folder, file), "utf8");
    const template = code.slice(0, code.indexOf("<script"));
    for (const match of template.matchAll(/(?<![:\w-])(?:title|label|placeholder|aria-label)="([^"{}]+)"/g)) strings.add(match[1]);
    for (const match of template.matchAll(/>([^<>]+)</g)) {
        const text = match[1].trim();
        if (!text.includes("{{") && /[A-Za-z]{3}/.test(text) && !text.includes("=>")) strings.add(text);
    }
    for (const match of code.matchAll(/label:\s*"([^"\n]+)"/g)) strings.add(match[1]);
}
const presenter = await fs.readFile("src/blackbox-viewer/flightlog_fields_presenter.js", "utf8");
for (const match of presenter.split("const FRIENDLY_FIELD_NAMES =")[1].split("};")[0].matchAll(/:\s*"([^"\n]+)"/g)) strings.add(match[1]);
let translations = {};
try { translations = JSON.parse(await fs.readFile("src/blackbox-viewer/chinese.json", "utf8")); } catch { /* First run. */ }
const pending = [...strings].filter((text) => /[A-Za-z]{3}/.test(text) && !translations[text]);
let cursor = 0;
async function worker() {
    while (cursor < pending.length) {
        const batch = pending.slice(cursor, cursor += 12);
        const query = batch.map((text, index) => `<KZ${index}>${text}</KZ${index}>`).join("\n");
        const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" + encodeURIComponent(query);
        try {
            const { stdout } = await run("curl.exe", ["-LsS", "--proxy", process.env.KONZ_TRANSLATION_PROXY, "--max-time", "20", url], { maxBuffer: 1024 * 1024 });
            const text = JSON.parse(stdout)[0].map((part) => part[0]).join("");
            batch.forEach((original, index) => {
                const match = text.match(new RegExp(`<KZ\\s*${index}\\s*>([\\s\\S]*?)<\\/KZ\\s*${index}\\s*>`, "i"));
                if (match?.[1].trim()) translations[original] = match[1].trim();
            });
        } catch { console.log("Translation batch failed", batch); }
    }
}
await Promise.all([worker(), worker(), worker()]);
await fs.writeFile("src/blackbox-viewer/chinese.json", JSON.stringify(translations, null, 2));
console.log(JSON.stringify({ strings: strings.size, translated: Object.keys(translations).length, missing: [...strings].filter((text) => /[A-Za-z]{3}/.test(text) && !translations[text]) }));
