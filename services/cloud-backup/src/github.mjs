import { writeToken } from "./credentials.mjs";
import { ensure, HttpError, base64 } from "./validation.mjs";
export class GitHub {
  constructor(env) {
    this.env = env;
    for (const key of ["GITHUB_OWNER", "GITHUB_INBOX", "GITHUB_LIBRARY"])
      ensure(/^[\w.-]+$/.test(env[key] || ""), "GitHub 仓库配置缺失", 503);
  }
  async request(path, options = {}) {
    const response = await fetch("https://api.github.com" + path, {
      method: options.method || "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "KONz-Cloud-Backup",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: "Bearer " + (await writeToken(this.env)),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (response.status === 404 && options.optional) return null;
    if (!response.ok)
      throw new HttpError(
        502,
        "GitHub 存储操作失败（" + response.status + "），可稍后重试",
      );
    return response.status === 204 ? null : response.json();
  }
  path(repo) {
    return "/repos/" + this.env.GITHUB_OWNER + "/" + repo;
  }
  async createRelease(id) {
    return this.request(this.path(this.env.GITHUB_INBOX) + "/releases", {
      method: "POST",
      body: {
        tag_name: "submission-" + id,
        name: id,
        body: "Private pending submission. Review before publishing.",
        draft: true,
        prerelease: true,
      },
    });
  }
  async upload(releaseId, name, bytes, mime) {
    const url =
      "https://uploads.github.com" +
      this.path(this.env.GITHUB_INBOX) +
      "/releases/" +
      releaseId +
      "/assets?name=" +
      encodeURIComponent(name);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (await writeToken(this.env)),
        "Content-Type": mime,
        "User-Agent": "KONz-Cloud-Backup",
        Accept: "application/vnd.github+json",
      },
      body: bytes,
      signal: AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!r.ok) throw new HttpError(502, "待审材料保存失败（" + r.status + "）");
    return r.json();
  }
  async removeAsset(id) {
    await this.request(
      this.path(this.env.GITHUB_INBOX) + "/releases/assets/" + id,
      { method: "DELETE" },
    );
  }
  async removeRelease(id) {
    await this.request(this.path(this.env.GITHUB_INBOX) + "/releases/" + id, {
      method: "DELETE",
    });
  }
  async asset(id) {
    const r = await fetch(
      "https://api.github.com" +
        this.path(this.env.GITHUB_INBOX) +
        "/releases/assets/" +
        id,
      {
        headers: {
          Authorization: "Bearer " + (await writeToken(this.env)),
          Accept: "application/octet-stream",
          "User-Agent": "KONz-Cloud-Backup",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      },
    );
    if (r.status === 302) {
      const url = new URL(r.headers.get("location"));
      ensure(
        url.protocol === "https:" &&
          [
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
          ].includes(url.hostname),
        "附件地址无效",
        502,
      );
      const file = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      ensure(file.ok, "无法读取待审附件", 502);
      return new Uint8Array(await file.arrayBuffer());
    }
    ensure(
      r.ok && r.headers.get("content-type")?.includes("octet-stream"),
      "无法读取待审附件",
      502,
    );
    return new Uint8Array(await r.arrayBuffer());
  }
  async publicFile(path, sha) {
    ensure(/^[a-f0-9]{40}$/.test(sha), "发布版本缺失", 503);
    const owner = this.env.GITHUB_OWNER,
      repo = this.env.GITHUB_LIBRARY;
    const r = await fetch(
      "https://raw.githubusercontent.com/" +
        owner +
        "/" +
        repo +
        "/" +
        sha +
        "/" +
        path,
      { signal: AbortSignal.timeout(30000), redirect: "error" },
    );
    ensure(r.ok, "已发布文件读取失败", 502);
    return new Uint8Array(await r.arrayBuffer());
  }
  async commitPublication(entry, blobs, remove = false) {
    const path = this.path(this.env.GITHUB_LIBRARY);
    const treeFiles = [];
    if (!remove)
      for (const file of blobs) {
        const blob = await this.request(path + "/git/blobs", {
          method: "POST",
          body: { content: base64(file.bytes), encoding: "base64" },
        });
        treeFiles.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }
    for (let attempt = 0; attempt < 5; attempt++) {
      const head = await this.request(path + "/git/ref/heads/main");
      const commit = await this.request(
        path + "/git/commits/" + head.object.sha,
      );
      const old = await this.request(
        path + "/contents/approved/index.json?ref=" + head.object.sha,
        { optional: true },
      );
      let entries = [];
      if (old) {
        const data = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(old.content.replace(/\n/g, "")), (c) =>
              c.charCodeAt(0),
            ),
          ),
        );
        ensure(
          data.schemaVersion === 1 && Array.isArray(data.entries),
          "公开清单格式异常",
          502,
        );
        entries = data.entries;
      }
      entries = entries.filter((row) => row.id !== entry.id);
      if (!remove) entries.unshift(entry);
      const manifest = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        entries,
      };
      const tree = await this.request(path + "/git/trees", {
        method: "POST",
        body: {
          base_tree: commit.tree.sha,
          tree: [
            ...treeFiles,
            {
              path: "approved/index.json",
              mode: "100644",
              type: "blob",
              content: JSON.stringify(manifest, null, 2) + "\n",
            },
          ],
        },
      });
      const next = await this.request(path + "/git/commits", {
        method: "POST",
        body: {
          message: (remove ? "Withdraw " : "Publish ") + entry.id,
          tree: tree.sha,
          parents: [head.object.sha],
        },
      });
      const r = await fetch(
        "https://api.github.com" + path + "/git/refs/heads/main",
        {
          method: "PATCH",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: "Bearer " + (await writeToken(this.env)),
            "User-Agent": "KONz-Cloud-Backup",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sha: next.sha, force: false }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (r.ok) return next.sha;
      if (![409, 422].includes(r.status))
        throw new HttpError(502, "更新公开清单失败（" + r.status + "）");
    }
    throw new HttpError(409, "公开清单正在更新，请稍后重试审核");
  }
}
