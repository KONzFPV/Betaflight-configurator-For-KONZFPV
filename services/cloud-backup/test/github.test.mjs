import test from "node:test";
import assert from "node:assert/strict";
import { GitHub } from "../src/github.mjs";
import { appJwt, createAppManifest, setup } from "../src/credentials.mjs";
import { generateKeyPairSync } from "node:crypto";
const env = {
  GITHUB_OWNER: "owner",
  GITHUB_INBOX: "inbox",
  GITHUB_LIBRARY: "library",
  GITHUB_WRITE_TOKEN: "test-only",
};
test("publishes files and manifest together; retries a competing branch update without losing entries", async () => {
  const original = globalThis.fetch;
  let refUpdates = 0,
    trees = [],
    blobs = 0;
  globalThis.fetch = async (url, opt = {}) => {
    const path = new URL(url).pathname,
      body = opt.body ? JSON.parse(opt.body) : null;
    let data = {};
    if (path.endsWith("/git/blobs")) {
      blobs++;
      data = { sha: "a".repeat(40) };
    } else if (path.endsWith("/git/ref/heads/main"))
      data = { object: { sha: String(refUpdates + 1).repeat(40) } };
    else if (path.includes("/git/commits/") && !body)
      data = { tree: { sha: "b".repeat(40) } };
    else if (path.includes("/contents/"))
      data = {
        content: btoa(
          JSON.stringify({
            schemaVersion: 1,
            entries: [{ id: refUpdates ? "other-new" : "other-old" }],
          }),
        ),
      };
    else if (path.endsWith("/git/trees")) {
      trees.push(body.tree);
      data = { sha: "c".repeat(40) };
    } else if (path.endsWith("/git/commits")) data = { sha: "d".repeat(40) };
    else if (path.endsWith("/git/refs/heads/main")) {
      refUpdates++;
      if (refUpdates === 1) return Response.json({}, { status: 422 });
    } else throw Error("Unexpected request " + path);
    return Response.json(data);
  };
  try {
    const gh = new GitHub(env);
    await gh.commitPublication({ id: "new" }, [
      { path: "backups/new/firmware.hex", bytes: new Uint8Array([1, 2]) },
    ]);
    assert.equal(blobs, 1);
    assert.equal(refUpdates, 2);
    assert.equal(trees[1][0].path, "backups/new/firmware.hex");
    const manifest = JSON.parse(
      trees[1].find((v) => v.path === "approved/index.json").content,
    );
    assert.deepEqual(
      manifest.entries.map((v) => v.id),
      ["new", "other-new"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("GitHub App private keys work in PKCS1 and PKCS8 format", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  for (const type of ["pkcs1", "pkcs8"]) {
    const token = await appJwt({
      appId: 123,
      privateKey: privateKey.export({ type, format: "pem" }).toString(),
    });
    const parts = token.split(".");
    assert.equal(parts.length, 3);
    const key = await crypto.subtle.importKey(
      "spki",
      publicKey.export({ type: "spki", format: "der" }),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    assert.equal(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        Buffer.from(parts[2], "base64url"),
        new TextEncoder().encode(parts[0] + "." + parts[1]),
      ),
      true,
    );
  }
});

test("manifest provides GitHub's required webhook URL even with deliveries disabled", () => {
  const origin = "https://backup.example.test",
    manifest = createAppManifest(origin);
  assert.equal(manifest.url, origin);
  assert.equal(manifest.hook_attributes.url, origin + "/api/github/webhook");
  assert.equal(manifest.hook_attributes.active, false);
  assert.equal(manifest.redirect_url, origin + "/setup/github/callback");
  assert.deepEqual(manifest.callback_urls, [origin + "/auth/callback"]);
  assert.deepEqual(manifest.default_permissions, { contents: "write" });
  assert.deepEqual(manifest.default_events, []);
  assert.throws(() => createAppManifest("http://backup.example.test"));
});
test("both setup entry points send a complete manifest to GitHub", async () => {
  const origin = "https://backup.example.test";
  const env = {
    PUBLIC_ORIGIN: origin,
    SETUP_TOKEN: "test-setup-only",
    DB: {
      prepare(sql) {
        return {
          bind() {
            return this;
          },
          async first() {
            return sql.includes("setup-launch") ? { state_hash: "test" } : null;
          },
          async run() {
            return { success: true };
          },
        };
      },
    },
  };
  const htmlResponse = await setup(
    new Request(origin + "/setup/start?token=test"),
    env,
    "/setup/start",
  );
  assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text();
  const encoded = html.match(/name="manifest" value="([^"]+)"/)[1];
  const submitted = JSON.parse(
    encoded
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&"),
  );
  assert.equal(submitted.hook_attributes.url, origin + "/api/github/webhook");
  const jsonResponse = await setup(
    new Request(origin + "/api/setup/manifest", {
      method: "POST",
      headers: { authorization: "Bearer test-setup-only" },
    }),
    env,
    "/api/setup/manifest",
  );
  assert.equal(
    (await jsonResponse.json()).manifest.hook_attributes.url,
    origin + "/api/github/webhook",
  );
});
