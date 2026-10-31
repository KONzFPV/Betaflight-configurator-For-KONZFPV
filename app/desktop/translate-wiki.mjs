import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { marked } from "marked";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);
const output = path.join(repo, "resources/konz-wiki");
const pages = JSON.parse(await fs.readFile(path.join(output, "catalog.json"), "utf8"));
const cachePath = path.join(here, "wiki-translation-cache.ndjson");
const cache = new Map();
try {
    for (const line of (await fs.readFile(cachePath, "utf8")).split("\n").filter(Boolean)) {
        try { const [key, value] = JSON.parse(line); cache.set(key, value); } catch { /* Ignore a truncated last checkpoint. */ }
    }
} catch { /* The first run creates the translation cache. */ }
const proxy = process.env.KONZ_TRANSLATION_PROXY;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const documents = [];
const tasks = new Map();
function include(text) {
    const key = hash(text);
    if (!cache.has(key)) tasks.set(key, text);
    return key;
}
function skip(node) {
    for (let element = node.parentElement; element; element = element.parentElement)
        if (["CODE", "PRE", "SCRIPT", "STYLE", "SVG", "MATH"].includes(element.tagName)) return true;
    const text = node.textContent.trim();
    return !/[A-Za-z]{2}/.test(text) || /^(?:https?:\/\/|\/?[\w./-]+\.(?:png|jpg|svg|md)$)/.test(text);
}
for (const page of pages) {
    const document = new JSDOM(`<body>${marked.parse(page.body)}</body>`).window.document;
    const nodes = [];
    const walker = document.createTreeWalker(document.body, 4);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (skip(node)) continue;
        const text = node.textContent.trim();
        // Keep API identifiers, register names and literal build flags intact.
        if (/^[A-Z0-9_ .:/+()\[\]-]+$/.test(text) && !/\s[a-z]/.test(text) && text.length < 35) continue;
        nodes.push({ node, key: include(text), text });
    }
    documents.push({ page, document, nodes, titleKey: include(page.title) });
}
const pending = [...tasks.entries()];
const batches = [];
let batch = [], length = 0;
for (const item of pending) {
    if (batch.length && (length + item[1].length > 3400 || batch.length >= 24)) {
        batches.push(batch); batch = []; length = 0;
    }
    batch.push(item); length += item[1].length;
}
if (batch.length) batches.push(batch);
let cursor = 0, finished = 0, failed = 0;
async function translateBatch(items) {
    const query = items.map(([, text], index) => `<KZ${index}>${text}</KZ${index}>`).join("\n");
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" + encodeURIComponent(query);
    const args = ["-LsS", "--connect-timeout", "8", "--max-time", "30", "--retry", "1", "--get"];
    if (proxy) args.push("--proxy", proxy);
    const { stdout } = await run("curl.exe", [...args, url], { maxBuffer: 1024 * 1024, timeout: 65000 });
    const data = JSON.parse(stdout);
    const text = data[0].map((segment) => segment[0] || "").join("");
    const values = items.map(([, original], index) => {
        const match = text.match(new RegExp(`<KZ\\s*${index}\\s*>([\\s\\S]*?)<\\/KZ\\s*${index}\\s*>`, "i"));
        if (!match) throw new Error(`Missing translation segment ${index}`);
        const value = match[1].trim();
        if (!value || (/[A-Za-z]/.test(original) && !/[\u3400-\u9fff]/.test(value) && original.length > 80))
            throw new Error("Untranslated prose");
        return value;
    });
    for (let i = 0; i < items.length; i++) cache.set(items[i][0], values[i]);
    await fs.appendFile(cachePath, items.map(([key], index) => JSON.stringify([key, values[index]])).join("\n") + "\n");
}
async function worker() {
    while (cursor < batches.length) {
        const index = cursor++;
        const items = batches[index];
        try {
            await translateBatch(items);
        } catch {
            for (const item of items) {
                try { await translateBatch([item]); } catch { failed++; }
            }
        }
        finished++;
        if (finished % 10 === 0 || finished === batches.length)
            console.log(JSON.stringify({ batches: batches.length, finished, failed, cached: cache.size }));
    }
}
console.log(JSON.stringify({ articles: pages.length, cached: cache.size, pending: pending.length, batches: batches.length }));
if (!process.env.KONZ_WIKI_INSPECT) await Promise.all([worker(), worker(), worker(), worker()]);
const translations = {};
for (const { page, document, nodes, titleKey } of documents) {
    const missing = nodes.filter(({ key }) => !cache.has(key));
    if (process.env.KONZ_WIKI_INSPECT) for (const item of missing) console.log(JSON.stringify({id:page.id,key:item.key,text:item.text}));
    for (const { node, key, text } of nodes) {
        if (cache.has(key)) node.textContent = node.textContent.replace(text, cache.get(key));
    }
    translations[page.id] = {
        titleZh: cache.get(titleKey) || page.title,
        html: document.body.innerHTML,
        missing: missing.length,
        total: nodes.length,
    };
}
await fs.writeFile(path.join(output, "translations.json"), JSON.stringify(translations));
const missingPages = Object.entries(translations).filter(([, value]) => value.missing).map(([id, value]) => ({ id, missing: value.missing }));
await fs.writeFile(path.join(output, "translation-report.json"), JSON.stringify({ source: "https://github.com/betaflight/betaflight.com", method: "Machine translation of official documentation; code blocks and inline code retained", articles: pages.length, complete: pages.length - missingPages.length, missingPages }, null, 2));
console.log(JSON.stringify({ translated: pages.length - missingPages.length, missingPages }));
if (missingPages.length) process.exitCode = 1;
