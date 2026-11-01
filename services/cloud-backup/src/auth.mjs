import { credentials } from "./credentials.mjs";
import { ensure, hash, HttpError } from "./validation.mjs";
export const now = () => Math.floor(Date.now() / 1000);
const text = new TextEncoder();
function b64(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function unb64(value) {
  return Uint8Array.from(
    atob(
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
}
export function random() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
async function key(env) {
  ensure(env.SESSION_SECRET?.length >= 32, "会话密钥尚未配置", 503);
  return crypto.subtle.importKey(
    "raw",
    text.encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function capability(env, claims) {
  const payload = b64(text.encode(JSON.stringify(claims)));
  return (
    payload +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", await key(env), text.encode(payload)),
      ),
    )
  );
}
export async function verifyCapability(request, env, id, roles) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  try {
    const [body, sig, ...tail] = token.split(".");
    ensure(body && sig && !tail.length, "投稿回执无效", 401);
    ensure(
      await crypto.subtle.verify(
        "HMAC",
        await key(env),
        unb64(sig),
        text.encode(body),
      ),
      "投稿回执无效",
      401,
    );
    const claims = JSON.parse(new TextDecoder().decode(unb64(body)));
    ensure(
      claims.id === id && roles.includes(claims.role) && claims.exp > now(),
      "投稿回执已过期或无权操作",
      401,
    );
    return claims;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, "投稿回执无效");
  }
}
function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim().split("=")),
  );
}
function cookie(name, value, age) {
  return (
    name +
    "=" +
    value +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
    age
  );
}
function redirect(url, cookieValue) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": cookieValue,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function session(request, env, mutate = false) {
  const token = cookies(request)["__Host-konz-session"];
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(token), now())
    .first();
  if (!row) return null;
  if (mutate)
    ensure(
      request.headers.get("x-csrf-token") === row.csrf,
      "审核会话校验失败，请刷新页面",
      403,
    );
  return row;
}
export async function requireAdmin(request, env) {
  const value = await session(
    request,
    env,
    !["GET", "HEAD"].includes(request.method),
  );
  ensure(value, "请先使用管理员 GitHub 账号登录", 401);
  return value;
}
export async function authRoute(request, env, path) {
  ensure(
    /^https:\/\//.test(env.PUBLIC_ORIGIN || ""),
    "请先配置服务的 HTTPS 地址",
    503,
  );
  const origin = new URL(env.PUBLIC_ORIGIN).origin;
  const app = await credentials(env);
  ensure(new URL(request.url).origin === origin, "登录域名不匹配", 400);
  if (path === "/auth/login") {
    ensure(app?.clientId && app?.clientSecret, "GitHub 审核登录尚未配置", 503);
    const state = random(),
      verifier = random(),
      challenge = b64(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", text.encode(verifier)),
        ),
      );
    await env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?)")
      .bind(await hash(state), verifier, now() + 600)
      .run();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: origin + "/auth/callback",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return redirect(url.href, cookie("__Host-konz-oauth", state, 600));
  }
  if (path === "/auth/callback") {
    const url = new URL(request.url),
      state = url.searchParams.get("state");
    ensure(
      state && state === cookies(request)["__Host-konz-oauth"],
      "GitHub 登录状态不匹配，请重新登录",
      400,
    );
    const value = await env.DB.prepare(
      "DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING verifier",
    )
      .bind(await hash(state), now())
      .first();
    ensure(value && url.searchParams.get("code"), "登录请求已过期", 400);
    const r = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        code: url.searchParams.get("code"),
        redirect_uri: origin + "/auth/callback",
        code_verifier: value.verifier,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const access = await r.json();
    ensure(r.ok && access.access_token, "GitHub 登录失败，请重试", 401);
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: "Bearer " + access.access_token,
        Accept: "application/vnd.github+json",
        "User-Agent": "KONz-Cloud-Backup",
      },
      signal: AbortSignal.timeout(20000),
    });
    const user = await userResponse.json();
    ensure(
      userResponse.ok && String(user.id) === env.ADMIN_GITHUB_ID,
      "此 GitHub 账号没有审核权限",
      403,
    );
    const token = random();
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(await hash(token), random(), now() + 8 * 3600)
      .run();
    const response = redirect(
      origin + "/#review",
      cookie("__Host-konz-session", token, 8 * 3600),
    );
    response.headers.append("Set-Cookie", cookie("__Host-konz-oauth", "", 0));
    return response;
  }
  if (path === "/auth/logout") {
    await requireAdmin(request, env);
    const token = cookies(request)["__Host-konz-session"];
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
    return new Response(null, {
      status: 204,
      headers: { "Set-Cookie": cookie("__Host-konz-session", "", 0) },
    });
  }
  throw new HttpError(404, "登录接口不存在");
}
