import { DatabaseSync } from "node:sqlite";
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

function setupDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE oauth_states(state_hash TEXT PRIMARY KEY, verifier TEXT, expires_at INTEGER); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);",
  );
  return {
    db,
    binding: {
      prepare(sql) {
        let args = [];
        return {
          bind(...values) {
            args = values;
            return this;
          },
          async first() {
            return db.prepare(sql).get(...args) || null;
          },
          async run() {
            return db.prepare(sql).run(...args);
          },
        };
      },
    },
  };
}
test("setup link survives previews, repeated opens and browser refreshes", async () => {
  const { db, binding } = setupDatabase(),
    origin = "https://backup.example.test";
  const env = { PUBLIC_ORIGIN: origin, SETUP_TOKEN: "test-token", DB: binding };
  try {
    const created = await setup(
      new Request(origin + "/api/setup/link", {
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      }),
      env,
      "/api/setup/link",
    );
    const ticket = await created.json();
    assert.ok(ticket.expiresAt >= Math.floor(Date.now() / 1000) + 3590);
    const preview = await setup(new Request(ticket.url), env, "/setup/start");
    assert.equal(preview.status, 200);
    const first = await setup(new Request(ticket.url), env, "/setup/start");
    assert.equal(first.status, 200);
    const firstCookie = first.headers.get("Set-Cookie").split(";")[0];
    const firstState = (await first.text()).match(
      /apps\/new\?state=([^"]+)/,
    )[1];
    const refreshed = await setup(
      new Request(ticket.url, { headers: { Cookie: firstCookie } }),
      env,
      "/setup/start",
    );
    assert.equal(refreshed.status, 200);
    assert.equal(
      (await refreshed.text()).match(/apps\/new\?state=([^"]+)/)[1],
      firstState,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM oauth_states WHERE verifier='setup-launch'",
        )
        .get().n,
      1,
    );
    assert.match(
      refreshed.headers.get("Set-Cookie"),
      /Secure; HttpOnly; SameSite=Lax/,
    );
  } finally {
    db.close();
  }
});
test("expired or unknown setup links still fail, while expired browser state can restart", async () => {
  const { db, binding } = setupDatabase(),
    origin = "https://backup.example.test";
  const env = { PUBLIC_ORIGIN: origin, SETUP_TOKEN: "test-token", DB: binding };
  try {
    const created = await setup(
      new Request(origin + "/api/setup/link", {
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      }),
      env,
      "/api/setup/link",
    );
    const { url } = await created.json();
    const first = await setup(new Request(url), env, "/setup/start");
    const cookie = first.headers.get("Set-Cookie").split(";")[0];
    db.exec("UPDATE oauth_states SET expires_at=0 WHERE verifier='setup'");
    const again = await setup(
      new Request(url, { headers: { Cookie: cookie } }),
      env,
      "/setup/start",
    );
    assert.equal(again.status, 200);
    assert.notEqual(again.headers.get("Set-Cookie").split(";")[0], cookie);
    db.exec(
      "UPDATE oauth_states SET expires_at=0 WHERE verifier='setup-launch'",
    );
    await assert.rejects(
      setup(new Request(url), env, "/setup/start"),
      /1 小时/,
    );
    await assert.rejects(
      setup(
        new Request(origin + "/setup/start?token=not-issued"),
        env,
        "/setup/start",
      ),
      /过期/,
    );
  } finally {
    db.close();
  }
});

test("setup callback survives a transient exchange failure, stores encrypted credentials, and refreshes without exchanging twice", async () => {
  const { db, binding } = setupDatabase(),
    origin = "https://backup.example.test";
  const env = {
    PUBLIC_ORIGIN: origin,
    SETUP_TOKEN: "test-token",
    SESSION_SECRET: "s".repeat(40),
    ADMIN_GITHUB_ID: "151951515",
    DB: binding,
  };
  const originalFetch = globalThis.fetch;
  let exchanges = 0;
  try {
    const ticket = await (
      await setup(
        new Request(origin + "/api/setup/link", {
          method: "POST",
          headers: { Authorization: "Bearer test-token" },
        }),
        env,
        "/api/setup/link",
      )
    ).json();
    const entry = await setup(new Request(ticket.url), env, "/setup/start");
    const cookie = entry.headers.get("set-cookie").split(";")[0];
    const state = (await entry.text()).match(/apps\/new\?state=([^"&]+)/)[1];
    const request = () =>
      new Request(
        origin + "/setup/github/callback?state=" + state + "&code=test-code",
        { headers: { Cookie: cookie } },
      );
    globalThis.fetch = async (url, options) => {
      // Match the edge runtime, which rejects redirect:error before making a request.
      assert.equal(options.redirect, "manual");
      exchanges++;
      if (exchanges === 1) throw new TypeError("temporary network failure");
      return Response.json({
        id: 42,
        owner: { id: 151951515 },
        pem: "private-test-material",
        client_secret: "secret-test-material",
        client_id: "test-id",
        slug: "test-backup-app",
      });
    };
    await assert.rejects(
      setup(request(), env, "/setup/github/callback"),
      /github-request/,
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM oauth_states WHERE verifier='setup'",
        )
        .get().n,
      1,
    );
    const successful = await setup(request(), env, "/setup/github/callback");
    assert.equal(successful.status, 302);
    assert.equal(
      successful.headers.get("location"),
      "https://github.com/apps/test-backup-app/installations/new",
    );
    const stored = db
      .prepare("SELECT value FROM settings WHERE key='github_app'")
      .get().value;
    assert.ok(
      !stored.includes("private-test-material") &&
        !stored.includes("secret-test-material"),
    );
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM oauth_states WHERE verifier='setup'",
        )
        .get().n,
      0,
    );
    assert.equal(
      (await setup(request(), env, "/setup/github/callback")).status,
      302,
    );
    assert.equal(exchanges, 2);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("GitHub storage requests reject redirects without forwarding credentials", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(options.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { location: "https://unexpected.example.test" },
    });
  };
  try {
    const gh = new GitHub(env);
    await assert.rejects(gh.request("/repos/owner/inbox"), /302/);
    await assert.rejects(
      gh.upload(1, "test.jpg", new Uint8Array([1]), "image/jpeg"),
      /302/,
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
