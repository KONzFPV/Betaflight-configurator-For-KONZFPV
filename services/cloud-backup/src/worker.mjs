import { setup, credentials } from "./credentials.mjs";
import {
  HttpError,
  ensure,
  hash,
  readBytes,
  jsonBody,
  metadata,
  validateHex,
  validateJpeg,
} from "./validation.mjs";
import { GitHub } from "./github.mjs";
import {
  now,
  random,
  capability,
  verifyCapability,
  session,
  requireAdmin,
  authRoute,
} from "./auth.mjs";
const names = { hex: "firmware.hex", front: "front.jpg", back: "back.jpg" };
function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
async function row(env, id) {
  const value = await env.DB.prepare("SELECT * FROM submissions WHERE id=?")
    .bind(id)
    .first();
  ensure(value, "找不到这份投稿", 404);
  return {
    ...value,
    metadata: JSON.parse(value.metadata),
    files: JSON.parse(value.files),
  };
}
async function lease(env, id) {
  const token = random();
  const result = await env.DB.prepare(
    "UPDATE submissions SET lease=?,lease_until=? WHERE id=? AND lease_until<?",
  )
    .bind(token, now() + 300, id, now())
    .run();
  ensure(result.meta.changes === 1, "此投稿正在处理，请稍后重试", 409);
  return token;
}
async function unlock(env, id, token) {
  await env.DB.prepare(
    "UPDATE submissions SET lease=NULL,lease_until=0 WHERE id=? AND lease=?",
  )
    .bind(id, token)
    .run();
}
async function event(env, id, actor, action, detail = "") {
  await env.DB.prepare(
    "INSERT INTO events(submission_id,at,actor,action,detail) VALUES(?,?,?,?,?)",
  )
    .bind(id, now(), actor, action, detail)
    .run();
}
function publicEntry(value) {
  return {
    id: value.id,
    ...value.metadata,
    createdAt: new Date(value.created_at * 1000).toISOString(),
    publishedAt: new Date(value.updated_at * 1000).toISOString(),
    hexFileSha256: value.files.hex.hash,
    imageSha256: value.files.hex.validation.imageSha256,
    hexBytes: value.files.hex.size,
    files: {
      hex: "backups/" + value.id + "/firmware.hex",
      front: "images/" + value.id + "/front.jpg",
      back: "images/" + value.id + "/back.jpg",
    },
  };
}
function receiptRow(value) {
  return {
    id: value.id,
    status: value.status,
    metadata: value.metadata,
    reason: value.reason,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    uploaded: Object.keys(value.files),
  };
}
function allowedOrigins(env) {
  return [env.PUBLIC_ORIGIN, ...(env.APP_ORIGINS || "").split(",")].filter(
    Boolean,
  );
}
function checkOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (origin)
    ensure(
      allowedOrigins(env).includes(origin),
      "此地面站来源尚未允许连接云备份",
      403,
    );
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("sec-fetch-site") === "cross-site" &&
    !origin
  )
    throw new HttpError(403, "请求来源不合法");
}
async function turnstile(request, env, token) {
  ensure(
    env.SUBMISSIONS_ENABLED === "true",
    "投稿尚未开放，下载和审核仍可使用",
    503,
  );
  ensure(
    env.TURNSTILE_SECRET && typeof token === "string" && token.length <= 2048,
    "人机验证尚未完成",
    400,
  );
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
  });
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  const r = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body, signal: AbortSignal.timeout(15000) },
  );
  const result = await r.json();
  ensure(
    r.ok &&
      result.success &&
      result.action === "backup-submit" &&
      allowedOrigins(env).some((o) => new URL(o).hostname === result.hostname),
    "人机验证失败，请重新验证",
    403,
  );
}
async function ticket(request, env) {
  const body = await jsonBody(request);
  const data = metadata(body.metadata);
  await turnstile(request, env, body.turnstileToken);
  const ip = request.headers.get("cf-connecting-ip");
  ensure(ip, "缺少 Cloudflare 来源信息", 503);
  const ipHash = await hash(env.SESSION_SECRET + ":" + ip),
    at = now(),
    day = at - (at % 86400);
  const id = "BK-" + crypto.randomUUID();
  const inserted = await env.DB.prepare(
    "INSERT INTO submissions(id,metadata,created_at,updated_at,ip_hash) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM submissions WHERE created_at>=?)<? AND (SELECT COUNT(*) FROM submissions WHERE created_at>=? AND ip_hash=?)<? AND (SELECT COUNT(*) FROM submissions WHERE status IN ('uploading','pending','publishing','publish_failed'))<?",
  )
    .bind(
      id,
      JSON.stringify(data),
      at,
      at,
      ipHash,
      day,
      Number(env.DAILY_GLOBAL_LIMIT || 20),
      day,
      ipHash,
      Number(env.DAILY_IP_LIMIT || 3),
      Number(env.OPEN_SUBMISSION_LIMIT || 100),
    )
    .run();
  ensure(
    inserted.meta.changes === 1,
    "今日投稿或待审数量已达限制，请稍后再试",
    429,
  );
  await event(env, id, "contributor", "created");
  return json(
    {
      id,
      uploadToken: await capability(env, {
        id,
        role: "upload",
        exp: at + 3600,
      }),
      receiptToken: await capability(env, {
        id,
        role: "receipt",
        exp: at + 90 * 86400,
      }),
      expiresAt: at + 3600,
    },
    201,
  );
}
async function upload(request, env, id, kind) {
  ensure(names[kind], "文件类型无效", 404);
  await verifyCapability(request, env, id, ["upload"]);
  const token = await lease(env, id);
  try {
    const value = await row(env, id);
    ensure(value.status === "uploading", "当前状态不能上传", 409);
    const bytes = await readBytes(
      request,
      kind === "hex" ? 12 * 1048576 : 1048576,
    );
    const validation =
      kind === "hex" ? await validateHex(bytes) : validateJpeg(bytes);
    const fileHash = await hash(bytes),
      existing = value.files[kind];
    if (existing) {
      ensure(
        existing.hash === fileHash,
        "此位置已上传不同文件，请重新建立投稿",
        409,
      );
      return json({ uploaded: true, reused: true });
    }
    const gh = new GitHub(env);
    let releaseId = value.release_id;
    if (!releaseId) {
      const release = await gh.createRelease(id);
      releaseId = release.id;
      await env.DB.prepare("UPDATE submissions SET release_id=? WHERE id=?")
        .bind(releaseId, id)
        .run();
    }
    const stored = await gh.upload(
      releaseId,
      names[kind],
      bytes,
      kind === "hex" ? "application/octet-stream" : "image/jpeg",
    );
    ensure(stored.size === bytes.length, "待审材料大小验证失败", 502);
    value.files[kind] = {
      assetId: stored.id,
      hash: fileHash,
      size: bytes.length,
      validation,
    };
    await env.DB.prepare(
      "UPDATE submissions SET files=?,updated_at=? WHERE id=?",
    )
      .bind(JSON.stringify(value.files), now(), id)
      .run();
    return json({ uploaded: true, hash: fileHash });
  } finally {
    await unlock(env, id, token);
  }
}
async function finalize(request, env, id) {
  await verifyCapability(request, env, id, ["upload"]);
  const token = await lease(env, id);
  try {
    const value = await row(env, id);
    if (value.status === "pending") return json(receiptRow(value));
    ensure(
      value.status === "uploading" &&
        Object.keys(names).every((k) => value.files[k]),
      "请先上传完整 HEX 和两张照片",
      409,
    );
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE submissions SET status='pending',updated_at=? WHERE id=?",
      ).bind(now(), id),
      env.DB.prepare(
        "INSERT INTO events(submission_id,at,actor,action) VALUES(?,?,'contributor','submitted')",
      ).bind(id, now()),
    ]);
    return json(receiptRow(await row(env, id)));
  } finally {
    await unlock(env, id, token);
  }
}
async function approve(request, env, id) {
  await requireAdmin(request, env);
  const token = await lease(env, id);
  try {
    let value = await row(env, id);
    if (value.status === "published") return json(receiptRow(value));
    ensure(
      ["pending", "publish_failed", "publishing"].includes(value.status),
      "此状态不能发布",
      409,
    );
    await env.DB.prepare(
      "UPDATE submissions SET status='publishing',updated_at=?,reason='' WHERE id=?",
    )
      .bind(now(), id)
      .run();
    const gh = new GitHub(env),
      blobs = [];
    try {
      for (const kind of Object.keys(names)) {
        const bytes = await gh.asset(value.files[kind].assetId);
        ensure(
          (await hash(bytes)) === value.files[kind].hash,
          "待审附件校验失败，未发布",
          502,
        );
        blobs.push({
          path:
            (kind === "hex" ? "backups/" : "images/") + id + "/" + names[kind],
          bytes,
        });
      }
      value = await row(env, id);
      const commit = await gh.commitPublication(publicEntry(value), blobs);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE submissions SET status='published',updated_at=?,commit_sha=?,reason='' WHERE id=?",
        ).bind(now(), commit, id),
        env.DB.prepare(
          "INSERT INTO events(submission_id,at,actor,action,detail) VALUES(?,?,'admin','published',?)",
        ).bind(id, now(), commit),
      ]);
    } catch (e) {
      await env.DB.prepare(
        "UPDATE submissions SET status='publish_failed',updated_at=?,reason=? WHERE id=?",
      )
        .bind(now(), "发布未完成，可重试；公开列表暂不显示", id)
        .run();
      await event(env, id, "system", "publish_failed");
      throw e;
    }
    return json(receiptRow(await row(env, id)));
  } finally {
    await unlock(env, id, token);
  }
}
async function decision(request, env, id, action) {
  await requireAdmin(request, env);
  const body = await jsonBody(request);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  ensure(reason.length >= 2 && reason.length <= 500, "请填写 2–500 字的原因");
  const token = await lease(env, id);
  try {
    const value = await row(env, id);
    if (action === "reject") {
      ensure(
        ["pending", "publish_failed", "rejected"].includes(value.status),
        "此状态不能拒绝",
        409,
      );
      // A failed publish may have committed before the response was lost. Remove it from the public manifest first.
      if (value.status === "publish_failed")
        await new GitHub(env).commitPublication({ id }, [], true);
      await env.DB.prepare(
        "UPDATE submissions SET status='rejected',updated_at=?,reason=? WHERE id=?",
      )
        .bind(now(), reason, id)
        .run();
    } else {
      ensure(
        ["published", "withdrawing", "withdrawn"].includes(value.status),
        "此状态不能下架",
        409,
      );
      await env.DB.prepare(
        "UPDATE submissions SET status='withdrawing',updated_at=?,reason=? WHERE id=?",
      )
        .bind(now(), reason, id)
        .run();
      await new GitHub(env).commitPublication({ id }, [], true);
      await env.DB.prepare(
        "UPDATE submissions SET status='withdrawn',updated_at=? WHERE id=?",
      )
        .bind(now(), id)
        .run();
    }
    await event(env, id, "admin", action, reason);
    return json(receiptRow(await row(env, id)));
  } finally {
    await unlock(env, id, token);
  }
}
async function fileResponse(request, env, id, kind, admin = false) {
  ensure(names[kind], "文件不存在", 404);
  if (admin) await requireAdmin(request, env);
  const value = await row(env, id);
  if (!admin)
    ensure(value.status === "published", "这份备份尚未公开或已下架", 404);
  const gh = new GitHub(env),
    file = value.files[kind];
  ensure(file, "文件不存在", 404);
  const bytes =
    admin && !value.commit_sha
      ? await gh.asset(file.assetId)
      : await gh.publicFile(
          (kind === "hex" ? "backups/" : "images/") + id + "/" + names[kind],
          value.commit_sha,
        );
  ensure(
    bytes.length === file.size && (await hash(bytes)) === file.hash,
    "下载内容校验失败，请重试",
    502,
  );
  return new Response(bytes, {
    headers: {
      "Content-Type":
        kind === "hex" ? "application/octet-stream" : "image/jpeg",
      "Content-Disposition":
        (kind === "hex" ? "attachment" : "inline") +
        '; filename="' +
        id +
        "-" +
        names[kind] +
        '"',
      "Cache-Control": "no-store",
      "X-Content-SHA256": file.hash,
    },
  });
}
async function api(request, env, path) {
  const method = request.method;
  if (path === "/api/config" && method === "GET")
    return json({
      service: "KONz Cloud Backup",
      mode: "cloud",
      submissionsEnabled: env.SUBMISSIONS_ENABLED === "true",
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
      mcuOptions: [
        "STM32F405",
        "STM32F722",
        "STM32F411",
        "STM32G473",
        "STM32H743",
        "custom",
      ],
      maxHexBytes: 12 * 1048576,
      maxPhotoBytes: 1048576,
    });
  ensure(env.DB, "云备份数据库尚未连接", 503);
  if (path === "/api/session" && method === "GET") {
    const s = await session(request, env);
    return json({ admin: !!s, csrf: s?.csrf || null });
  }
  if (path === "/api/library" && method === "GET") {
    const result = await env.DB.prepare(
      "SELECT * FROM submissions WHERE status='published' ORDER BY updated_at DESC LIMIT 200",
    ).all();
    return json({
      entries: result.results.map((v) =>
        publicEntry({
          ...v,
          metadata: JSON.parse(v.metadata),
          files: JSON.parse(v.files),
        }),
      ),
    });
  }
  if (path === "/api/tickets" && method === "POST") return ticket(request, env);
  const parts = path.match(
    /^\/api\/submissions\/(BK-[0-9a-f-]{36})(?:\/(.*))?$/,
  );
  if (parts) {
    const [, id, op] = parts;
    if (method === "GET" && !op) {
      await verifyCapability(request, env, id, ["receipt", "upload"]);
      return json(receiptRow(await row(env, id)));
    }
    if (method === "PUT" && op?.startsWith("files/"))
      return upload(request, env, id, op.slice(6));
    if (method === "POST" && op === "submit") return finalize(request, env, id);
  }
  const download = path.match(
    /^\/api\/files\/(BK-[0-9a-f-]{36})\/(hex|front|back)$/,
  );
  if (download && method === "GET")
    return fileResponse(request, env, download[1], download[2]);
  if (path === "/api/admin/submissions" && method === "GET") {
    await requireAdmin(request, env);
    const result = await env.DB.prepare(
      "SELECT * FROM submissions WHERE status!='uploading' ORDER BY created_at DESC LIMIT 200",
    ).all();
    return json({
      entries: result.results.map((v) => ({
        ...receiptRow({
          ...v,
          metadata: JSON.parse(v.metadata),
          files: JSON.parse(v.files),
        }),
        files: JSON.parse(v.files),
      })),
    });
  }
  const admin = path.match(
    /^\/api\/admin\/submissions\/(BK-[0-9a-f-]{36})\/(approve|reject|withdraw|events|files\/(?:hex|front|back))$/,
  );
  if (admin) {
    const [, id, op] = admin;
    if (op === "approve" && method === "POST") return approve(request, env, id);
    if (["reject", "withdraw"].includes(op) && method === "POST")
      return decision(request, env, id, op);
    if (op.startsWith("files/") && method === "GET")
      return fileResponse(request, env, id, op.slice(6), true);
    if (op === "events" && method === "GET") {
      await requireAdmin(request, env);
      const events = await env.DB.prepare(
        "SELECT at,actor,action,detail FROM events WHERE submission_id=? ORDER BY seq",
      )
        .bind(id)
        .all();
      return json(events.results);
    }
  }
  throw new HttpError(404, "接口不存在");
}
async function cleanup(env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?").bind(now()),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now()),
    env.DB.prepare(
      "UPDATE submissions SET status='expired',updated_at=?,reason='材料上传超时，请重新投稿' WHERE status='uploading' AND created_at<? AND lease_until<?",
    ).bind(now(), now() - 86400, now()),
  ]);
  const result = await env.DB.prepare(
    "SELECT id,release_id FROM submissions WHERE status IN ('rejected','expired') AND updated_at<? AND release_id IS NOT NULL LIMIT 10",
  )
    .bind(now() - 14 * 86400)
    .all();
  const gh = new GitHub(env);
  for (const value of result.results) {
    try {
      await gh.removeRelease(value.release_id);
      await env.DB.prepare("UPDATE submissions SET release_id=NULL WHERE id=?")
        .bind(value.id)
        .run();
    } catch {
      console.error("Pending cleanup failed", value.id);
    }
  }
}
export default {
  async fetch(request, env) {
    let response;
    try {
      const url = new URL(request.url),
        path = url.pathname;
      checkOrigin(request, env);
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else if (path === "/health")
        response = json({
          ok: true,
          service: "konz-cloud-backup",
          configured: !!(
            env.DB &&
            env.SESSION_SECRET &&
            (await credentials(env))
          ),
          submissionsEnabled: env.SUBMISSIONS_ENABLED === "true",
        });
      else if (path.startsWith("/setup/") || path.startsWith("/api/setup/"))
        response = await setup(request, env, path);
      else if (path.startsWith("/auth/")) {
        ensure(
          (path === "/auth/logout" && request.method === "POST") ||
            (["/auth/login", "/auth/callback"].includes(path) &&
              request.method === "GET"),
          "登录请求方法错误",
          405,
        );
        response = await authRoute(request, env, path);
      } else if (path.startsWith("/api/"))
        response = await api(request, env, path);
      else response = await env.ASSETS.fetch(request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error("Cloud backup error", error?.name);
      response = json(
        {
          error: status === 500 ? "服务暂时不可用，请稍后重试" : error.message,
        },
        status,
      );
    }
    response = new Response(response.body, response);
    const origin = request.headers.get("origin");
    if (origin && allowedOrigins(env).includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-CSRF-Token",
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,OPTIONS",
      );
      response.headers.set("Vary", "Origin");
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://github.com",
    );
    return response;
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};
