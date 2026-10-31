import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const mixin = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export async function loadChannelVideos(fetcher: typeof fetch, cacheFile: string) {
    const headers = { "User-Agent": "Mozilla/5.0", Referer: "https://space.bilibili.com/3546875475003918" };
    async function json(url: string) {
        const response = await fetcher(url, { headers, redirect: "error", signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error("Video service unavailable");
        return response.json();
    }
    try {
        const nav = await json("https://api.bilibili.com/x/web-interface/nav");
        const image = nav.data?.wbi_img;
        if (!image) throw new Error("Video service unavailable");
        const stem = (url: string) => new URL(url).pathname.split("/").pop()!.split(".")[0];
        const key = stem(image.img_url) + stem(image.sub_url);
        if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid video service key");
        const salt = mixin.map((index) => key[index]).join("").slice(0, 32);
        const params = { mid: "3546875475003918", order: "pubdate", pn: "1", ps: "30", wts: String(Math.floor(Date.now() / 1000)) };
        const query = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
        const signature = createHash("md5").update(query + salt).digest("hex");
        const data = await json(`https://api.bilibili.com/x/space/wbi/arc/search?${query}&w_rid=${signature}`);
        if (data.code !== 0 || !Array.isArray(data.data?.list?.vlist)) throw new Error("Video service rejected request");
        const videos = data.data.list.vlist.slice(0, 30).filter((item: any) => /^BV[A-Za-z0-9]{10}$/.test(item.bvid)).map((item: any) => {
            let cover = String(item.pic || "").replace(/^\/\//, "https://");
            try { const url = new URL(cover); if (url.protocol !== "https:" || !url.hostname.endsWith(".hdslb.com")) cover = ""; } catch { cover = ""; }
            return { bvid: item.bvid, title: String(item.title || "").slice(0, 200), cover, duration: String(item.length || ""), published: Number(item.created) || 0 };
        });
        const result = { videos, updated: Date.now(), stale: false };
        await writeFile(cacheFile, JSON.stringify(result));
        return result;
    } catch {
        try {
            const cached = JSON.parse(await readFile(cacheFile, "utf8"));
            if (Array.isArray(cached.videos)) return { ...cached, stale: true };
        } catch { /* No successful refresh has been cached yet. */ }
        return { videos: [], updated: null, stale: true };
    }
}
