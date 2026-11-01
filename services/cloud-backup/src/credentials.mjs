import { ensure, hash, base64, HttpError } from "./validation.mjs";
import { random, now } from "./auth.mjs";
let cachedInstallation = null;
const encoder = new TextEncoder();
const encode = (v) =>
  base64(v).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
function unbase64(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function encryptionKey(env) {
  ensure(env.SESSION_SECRET?.length >= 32, "会话密钥尚未配置", 503);
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", encoder.encode(env.SESSION_SECRET)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    iv: base64(iv),
    data: base64(new Uint8Array(encrypted)),
  });
}
async function unseal(env, value) {
  const sealed = JSON.parse(value);
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unbase64(sealed.iv) },
    await encryptionKey(env),
    unbase64(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function credentials(env) {
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
    return {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  const stored = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='github_app'",
  ).first();
  return stored ? unseal(env, stored.value) : null;
}
function lengthBytes(length) {
  if (length < 128) return [length];
  const bytes = [];
  while (length) {
    bytes.unshift(length & 255);
    length >>>= 8;
  }
  return [128 + bytes.length, ...bytes];
}
function pkcs8(pem) {
  const raw = unbase64(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
  if (pem.includes("BEGIN PRIVATE KEY")) return raw;
  const prefix = [
    2,
    1,
    0,
    48,
    13,
    6,
    9,
    42,
    134,
    72,
    134,
    247,
    13,
    1,
    1,
    1,
    5,
    0,
    4,
    ...lengthBytes(raw.length),
  ];
  return new Uint8Array([
    48,
    ...lengthBytes(prefix.length + raw.length),
    ...prefix,
    ...raw,
  ]);
}
export async function appJwt(app) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(app.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const body =
    encode(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" }))) +
    "." +
    encode(
      encoder.encode(
        JSON.stringify({
          iat: now() - 60,
          exp: now() + 540,
          iss: String(app.appId),
        }),
      ),
    );
  return (
    body +
    "." +
    encode(
      new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          encoder.encode(body),
        ),
      ),
    )
  );
}
async function appRequest(path, jwt, body) {
  const r = await fetch("https://api.github.com" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + jwt,
      "User-Agent": "KONz-Cloud-Backup",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  ensure(r.ok, "GitHub App 尚未安装到两个专用仓库（" + r.status + "）", 503);
  return r.json();
}
export async function writeToken(env) {
  if (env.GITHUB_WRITE_TOKEN) return env.GITHUB_WRITE_TOKEN;
  const app = await credentials(env);
  ensure(app?.privateKey, "请先连接专用 GitHub App", 503);
  if (
    cachedInstallation?.appId === app.appId &&
    cachedInstallation.expires > now() + 120
  )
    return cachedInstallation.token;
  const jwt = await appJwt(app),
    prefix = "/repos/" + env.GITHUB_OWNER + "/";
  const [inbox, library] = await Promise.all([
    appRequest(prefix + env.GITHUB_INBOX + "/installation", jwt),
    appRequest(prefix + env.GITHUB_LIBRARY + "/installation", jwt),
  ]);
  ensure(
    inbox.id === library.id &&
      inbox.account?.id === Number(env.ADMIN_GITHUB_ID),
    "GitHub App 安装账号不匹配",
    403,
  );
  const value = await appRequest(
    "/app/installations/" + inbox.id + "/access_tokens",
    jwt,
    {
      repositories: [env.GITHUB_INBOX, env.GITHUB_LIBRARY],
      permissions: { contents: "write" },
    },
  );
  cachedInstallation = {
    appId: app.appId,
    token: value.token,
    expires: Math.floor(new Date(value.expires_at).getTime() / 1000),
  };
  return value.token;
}
const setupCookie = (value, age) =>
  "__Host-konz-setup=" +
  value +
  "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" +
  age;
export async function setup(request, env, path) {
  const origin = new URL(env.PUBLIC_ORIGIN).origin;
  ensure(new URL(request.url).origin === origin, "配置域名错误", 400);
  if (path === "/api/setup/status" && request.method === "GET") {
    const app = await credentials(env);
    let installed = false;
    if (app)
      try {
        await writeToken(env);
        installed = true;
      } catch {}
    return Response.json(
      {
        connected: !!app,
        installed,
        installUrl: app?.slug
          ? "https://github.com/apps/" + app.slug + "/installations/new"
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (path === "/api/setup/link" && request.method === "POST") {
    ensure(
      env.SETUP_TOKEN &&
        request.headers.get("authorization") === "Bearer " + env.SETUP_TOKEN,
      "配置凭证无效",
      401,
    );
    ensure(!(await credentials(env)), "GitHub App 已连接", 409);
    const token = random();
    await env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?)")
      .bind(await hash(token), "setup-launch", now() + 600)
      .run();
    return Response.json(
      { url: origin + "/setup/start?token=" + token },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (path === "/setup/start" && request.method === "GET") {
    const token = new URL(request.url).searchParams.get("token");
    ensure(token, "配置链接不完整", 400);
    const value = await env.DB.prepare(
      "DELETE FROM oauth_states WHERE state_hash=? AND verifier='setup-launch' AND expires_at>? RETURNING state_hash",
    )
      .bind(await hash(token), now())
      .first();
    ensure(value && !(await credentials(env)), "配置链接已使用或过期", 409);
    const state = random();
    await env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?)")
      .bind(await hash(state), "setup", now() + 600)
      .run();
    const manifest = {
      name: "KONz Backup " + crypto.randomUUID().slice(0, 8),
      url: origin,
      redirect_url: origin + "/setup/github/callback",
      callback_urls: [origin + "/auth/callback"],
      setup_url: origin + "/setup/installed",
      public: false,
      hook_attributes: { active: false },
      default_permissions: { contents: "write" },
      default_events: [],
      description: "KONz 飞控备份投稿与人工审核，只安装到两个专用备份仓库",
    };
    const escaped = JSON.stringify(manifest)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    return new Response(
      '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>连接 GitHub App</title><link rel="stylesheet" href="/styles.css"><body><main class="main"><h1>连接 KONz 云备份</h1><p>点击继续，在 GitHub 中创建应用，随后仅选择 konz-backup-inbox 和 konz-backup-library 两个仓库。</p><form method="post" action="https://github.com/settings/apps/new?state=' +
        state +
        '"><input type="hidden" name="manifest" value="' +
        escaped +
        '"><button class="primary" type="submit">继续：在 GitHub 创建应用</button></form></main></body></html>',
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": setupCookie(state, 600),
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (path === "/api/setup/manifest" && request.method === "POST") {
    ensure(
      env.SETUP_TOKEN &&
        request.headers.get("authorization") === "Bearer " + env.SETUP_TOKEN,
      "配置凭证无效",
      401,
    );
    ensure(!(await credentials(env)), "GitHub App 已连接，请使用现有应用", 409);
    const state = random();
    await env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?)")
      .bind(await hash(state), "setup", now() + 600)
      .run();
    const manifest = {
      name: "KONz Backup " + crypto.randomUUID().slice(0, 8),
      url: origin,
      redirect_url: origin + "/setup/github/callback",
      callback_urls: [origin + "/auth/callback"],
      setup_url: origin + "/setup/installed",
      public: false,
      hook_attributes: { active: false },
      default_permissions: { contents: "write" },
      default_events: [],
      description: "KONz 飞控备份投稿与人工审核，只安装到两个专用备份仓库",
    };
    return Response.json(
      {
        manifest,
        action: "https://github.com/settings/apps/new?state=" + state,
      },
      {
        headers: {
          "Set-Cookie": setupCookie(state, 600),
          "Cache-Control": "no-store",
        },
      },
    );
  }
  if (path === "/setup/github/callback" && request.method === "GET") {
    const url = new URL(request.url),
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    const cookie = (request.headers.get("cookie") || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("__Host-konz-setup="))
      ?.split("=")[1];
    ensure(
      state && code && state === cookie,
      "配置登录状态错误，请重新开始",
      400,
    );
    const stored = await env.DB.prepare(
      "DELETE FROM oauth_states WHERE state_hash=? AND verifier='setup' AND expires_at>? RETURNING state_hash",
    )
      .bind(await hash(state), now())
      .first();
    ensure(stored && !(await credentials(env)), "配置请求已过期或已连接", 409);
    const r = await fetch(
      "https://api.github.com/app-manifests/" +
        encodeURIComponent(code) +
        "/conversions",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "KONz-Cloud-Backup",
        },
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      },
    );
    const app = await r.json();
    ensure(
      r.ok &&
        app.pem &&
        app.client_secret &&
        app.owner?.id === Number(env.ADMIN_GITHUB_ID),
      "GitHub App 创建失败或账号不匹配",
      403,
    );
    const value = {
      appId: app.id,
      clientId: app.client_id,
      clientSecret: app.client_secret,
      privateKey: app.pem,
      slug: app.slug,
    };
    await env.DB.prepare(
      "INSERT INTO settings(key,value) VALUES('github_app',?)",
    )
      .bind(await seal(env, value))
      .run();
    return new Response(null, {
      status: 302,
      headers: {
        Location: "https://github.com/apps/" + app.slug + "/installations/new",
        "Set-Cookie": setupCookie("", 0),
        "Cache-Control": "no-store",
      },
    });
  }
  if (path === "/setup/installed" && request.method === "GET") {
    await writeToken(env);
    return new Response(null, {
      status: 302,
      headers: {
        Location: origin + "/auth/login",
        "Cache-Control": "no-store",
      },
    });
  }
  throw new HttpError(404, "配置接口不存在");
}
