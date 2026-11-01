import { validateHex, hash } from "./validation.mjs";
const $ = (id) => document.getElementById(id),
  esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const statuses = {
  uploading: "材料上传中",
  pending: "待审核",
  publishing: "正在发布",
  published: "已发布",
  rejected: "已拒绝",
  withdrawing: "正在下架",
  withdrawn: "已下架",
  publish_failed: "发布失败，可重试",
  expired: "上传已过期",
};
let config = null,
  auth = { admin: false },
  library = [],
  queue = [],
  hex = null,
  photos = {},
  turnstileToken = "",
  busy = false,
  selected = null,
  downloadEntry = null,
  seconds = 0,
  interval,
  photoVersions = { front: 0, back: 0 },
  hexVersion = 0;
function error(e) {
  $("global-error").textContent = e.message || String(e);
  $("global-error").hidden = false;
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  setTimeout(() => ($("toast").hidden = true), 5000);
}
function run(fn) {
  return (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch(error);
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body &&
      !(options.body instanceof Uint8Array) &&
      !(options.body instanceof Blob)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.method === "POST" && path.startsWith("/api/admin/")
        ? { "X-CSRF-Token": auth.csrf }
        : {}),
      ...options.headers,
    },
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
function receipts() {
  try {
    return JSON.parse(localStorage.getItem("konz-cloud-receipts") || "[]");
  } catch {
    return [];
  }
}
function saveReceipt(value) {
  const list = receipts().filter((v) => v.id !== value.id);
  list.unshift(value);
  localStorage.setItem("konz-cloud-receipts", JSON.stringify(list));
}
function saveFile(blob, name) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
function receiptFile(value) {
  saveFile(
    new Blob(
      [
        JSON.stringify(
          {
            service: location.origin,
            id: value.id,
            receiptToken: value.receiptToken,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    "KONz-" + value.id + "-投稿回执.json",
  );
}
function meta(value) {
  const d = value.metadata || value;
  return (
    "<h3>" +
    esc(d.brand) +
    " · " +
    esc(d.model) +
    '</h3><div class="meta"><span>' +
    esc(d.mcu) +
    "</span><span>硬件 " +
    esc(d.hardware) +
    "</span><span>" +
    esc(d.firmware) +
    '</span></div><p class="preserve">' +
    esc(d.note) +
    "</p>"
  );
}
function renderLibrary() {
  const search = $("search").value.trim().toLowerCase(),
    mcu = $("mcu-filter").value;
  const list = library.filter(
    (v) =>
      (!mcu || v.mcu === mcu) &&
      [v.brand, v.model, v.mcu, v.firmware]
        .join(" ")
        .toLowerCase()
        .includes(search),
  );
  $("library-list").innerHTML = list.length
    ? list
        .map(
          (v) =>
            '<article class="card cloud-item">' +
            meta(v) +
            '<div class="photos"><a target="_blank" href="/api/files/' +
            v.id +
            '/front"><img loading="lazy" src="/api/files/' +
            v.id +
            '/front" alt="飞控正面实拍"></a><a target="_blank" href="/api/files/' +
            v.id +
            '/back"><img loading="lazy" src="/api/files/' +
            v.id +
            '/back" alt="飞控背面实拍"></a></div><p class="hash">HEX SHA-256：' +
            esc(v.hexFileSha256) +
            '</p><button class="primary" data-download="' +
            v.id +
            '">下载完整 HEX</button></article>',
        )
        .join("")
    : '<div class="card empty">暂无符合条件的已批准备份。</div>';
}
async function refresh() {
  $("global-error").hidden = true;
  library = (await api("/api/library")).entries;
  const old = $("mcu-filter").value;
  $("mcu-filter").innerHTML =
    '<option value="">全部主控</option>' +
    [...new Set(library.map((v) => v.mcu))]
      .sort()
      .map((v) => "<option>" + esc(v) + "</option>")
      .join("");
  $("mcu-filter").value = old;
  renderLibrary();
  if (auth.admin) {
    queue = (await api("/api/admin/submissions")).entries;
    renderReview();
  }
}
function renderReview() {
  const state = $("review-filter").value;
  const list = queue.filter(
    (v) =>
      state === "all" ||
      (state === "pending"
        ? ["pending", "publish_failed", "publishing"].includes(v.status)
        : v.status === state),
  );
  $("review-list").innerHTML = list.length
    ? list
        .map(
          (v) =>
            '<article class="card cloud-item">' +
            meta(v) +
            "<p><b>" +
            esc(statuses[v.status]) +
            "</b> · " +
            esc(v.id) +
            "</p><p>" +
            esc(v.reason) +
            '</p><button data-review="' +
            v.id +
            '">查看材料并审核</button></article>',
        )
        .join("")
    : '<div class="card empty">当前没有此状态的投稿。</div>';
}
async function refreshMine() {
  const list = receipts(),
    rows = await Promise.all(
      list.map(async (v) => {
        try {
          return {
            ...(await api("/api/submissions/" + v.id, {
              headers: { Authorization: "Bearer " + v.receiptToken },
            })),
            receipt: v,
          };
        } catch (e) {
          return { id: v.id, status: "error", reason: e.message, receipt: v };
        }
      }),
    );
  $("mine-list").innerHTML = rows.length
    ? rows
        .map(
          (v) =>
            '<article class="card cloud-item">' +
            (v.metadata ? meta(v) : "") +
            "<h3>" +
            esc(statuses[v.status] || "暂时无法读取") +
            "</h3><p>" +
            esc(v.id) +
            "</p><p>" +
            esc(v.reason) +
            '</p><button data-receipt="' +
            v.id +
            '">保存投稿回执</button></article>',
        )
        .join("")
    : '<div class="card empty">此浏览器还没有投稿记录。</div>';
}
function route() {
  const page = ["library", "submit", "mine", "review", "setup"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "library";
  document
    .querySelectorAll("main>.page")
    .forEach((el) => (el.hidden = el.id !== page));
  $("title").textContent = {
    library: "飞控备份下载",
    submit: "飞控备份投稿",
    mine: "投稿进度",
    review: "云端审核",
    setup: "连接 GitHub",
  }[page];
  document
    .querySelectorAll("[data-go]")
    .forEach((el) => el.classList.toggle("active", el.dataset.go === page));
  if (page === "mine") run(refreshMine)();
  if (page === "setup") run(setupStatus)();
}
async function photo(side, file) {
  const version = ++photoVersions[side];
  delete photos[side];
  $("submit-button").disabled = true;
  if (!file) return;
  if (
    file.size > 8 * 1048576 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("请选择 8 MiB 以内的 JPG / PNG / WebP 照片");
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  if (canvas.width < 160 || canvas.height < 160) {
    bitmap.close();
    throw new Error("照片太小，请使用清晰实拍图");
  }
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82),
  );
  if (!blob || blob.size > 1048576)
    throw new Error("照片压缩后仍超过 1 MiB，请裁剪重试");
  if (version !== photoVersions[side]) return;
  photos[side] = blob;
  const img = $(side + "-preview");
  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  img.src = URL.createObjectURL(blob);
  img.dataset.url = img.src;
  img.hidden = false;
  updateSubmit();
}
function updateSubmit() {
  $("submit-button").disabled =
    busy ||
    !config?.submissionsEnabled ||
    !turnstileToken ||
    !hex ||
    !photos.front ||
    !photos.back;
}
async function selectHex(file) {
  const version = ++hexVersion;
  hex = null;
  updateSubmit();
  if (!file) return;
  if (!/\.hex$/i.test(file.name) || file.size > 12 * 1048576)
    throw new Error("请选择 12 MiB 以内的 .hex 文件");
  $("hex-info").textContent = "正在校验备份…";
  const bytes = new Uint8Array(await file.arrayBuffer()),
    validation = await validateHex(bytes);
  if (version !== hexVersion) return;
  hex = { bytes, name: file.name, validation };
  $("hex-info").textContent =
    file.name +
    " · 完整格式检查通过 · " +
    validation.decodedBytes / 1024 +
    " KiB 连续数据";
  updateSubmit();
}
async function submit(event) {
  event.preventDefault();
  if (busy) return;
  if (!$("submission-form").reportValidity()) return;
  if (!hex || !photos.front || !photos.back || !turnstileToken)
    throw new Error("请先选择完整备份、两张照片并完成人机验证");
  const data = Object.fromEntries(new FormData($("submission-form")));
  if (data.mcu === "custom") data.mcu = $("custom-mcu").value.trim();
  data.shareConsent = $("share").checked;
  data.experimentalConsent = $("experimental").checked;
  busy = true;
  updateSubmit();
  $("upload-info").textContent = "正在申请投稿回执…";
  try {
    const ticket = await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify({ metadata: data, turnstileToken }),
    });
    saveReceipt(ticket);
    const files = { hex: hex.bytes, front: photos.front, back: photos.back };
    for (const [kind, body] of Object.entries(files)) {
      $("upload-info").textContent =
        "正在保存" +
        { hex: "完整 HEX", front: "正面照片", back: "背面照片" }[kind] +
        "到私有待审区…";
      await api("/api/submissions/" + ticket.id + "/files/" + kind, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + ticket.uploadToken,
          "Content-Type":
            kind === "hex" ? "application/octet-stream" : "image/jpeg",
        },
        body,
      });
    }
    await api("/api/submissions/" + ticket.id + "/submit", {
      method: "POST",
      headers: { Authorization: "Bearer " + ticket.uploadToken },
      body: "{}",
    });
    $("upload-info").textContent = "已提交，等待管理员审核。";
    toast("已进入私有待审队列，尚未公开");
    receiptFile(ticket);
    location.hash = "mine";
  } catch (e) {
    $("upload-info").textContent =
      "尚未完成提交：" + e.message + "。投稿回执已保留，可在进度中查看。";
    throw e;
  } finally {
    busy = false;
    turnstileToken = "";
    if (window.turnstile) window.turnstile.reset();
    updateSubmit();
  }
}
function downloadStart(id) {
  downloadEntry = library.find((v) => v.id === id);
  if (!downloadEntry) return;
  seconds = 10;
  $("download-agree").checked = false;
  updateDownload();
  $("download-dialog").showModal();
  clearInterval(interval);
  interval = setInterval(() => {
    seconds = Math.max(0, seconds - 1);
    updateDownload();
    if (!seconds) clearInterval(interval);
  }, 1000);
}
function updateDownload() {
  $("download-confirm").disabled = !!seconds || !$("download-agree").checked;
  $("download-confirm").textContent = seconds
    ? "请阅读 " + seconds + " 秒"
    : "核验并保存 HEX";
  $("download-cancel").disabled = !!seconds;
}
async function download() {
  if (seconds || !$("download-agree").checked) return;
  const v = downloadEntry;
  $("download-confirm").disabled = true;
  try {
    const r = await fetch("/api/files/" + v.id + "/hex");
    if (!r.ok) throw new Error((await r.json()).error);
    const bytes = new Uint8Array(await r.arrayBuffer());
    if ((await hash(bytes)) !== v.hexFileSha256)
      throw new Error("文件 SHA-256 不匹配，已停止保存");
    saveFile(
      new Blob([bytes], { type: "application/octet-stream" }),
      v.id + "-firmware.hex",
    );
    $("download-dialog").close();
  } finally {
    updateDownload();
  }
}
async function review(id) {
  selected = queue.find((v) => v.id === id);
  if (!selected) return;
  $("review-title").textContent =
    statuses[selected.status] + " · " + selected.id;
  $("reason").value = "";
  $("review-agree").checked = false;
  $("decision-status").textContent = "";
  $("review-detail").innerHTML =
    meta(selected) +
    '<div class="cloud-photos">' +
    ["front", "back"]
      .map(
        (side) =>
          '<a target="_blank" href="/api/admin/submissions/' +
          id +
          "/files/" +
          side +
          '"><img src="/api/admin/submissions/' +
          id +
          "/files/" +
          side +
          '" alt="投稿' +
          (side === "front" ? "正面" : "背面") +
          '实拍"></a>',
      )
      .join("") +
    '</div><p class="hash">HEX：' +
    esc(selected.files.hex.hash) +
    '</p><p class="hash">镜像：' +
    esc(selected.files.hex.validation.imageSha256) +
    '</p><p>校验：记录校验和、连续地址、EOF 与完整内部 Flash 长度通过。仍需人工核对实际硬件。</p><a class="button soft" href="/api/admin/submissions/' +
    id +
    '/files/hex">下载待审 HEX 核验</a>';
  $("approve").hidden = !["pending", "publish_failed", "publishing"].includes(
    selected.status,
  );
  $("reject").hidden = !["pending", "publish_failed"].includes(selected.status);
  $("withdraw").hidden = !["published", "withdrawing"].includes(
    selected.status,
  );
  $("review-dialog").showModal();
}
async function decision(action) {
  if (busy || !selected) return;
  if (action === "approve" && !$("review-agree").checked)
    throw new Error("请先勾选已核对材料");
  const reason = $("reason").value.trim();
  if (action !== "approve" && reason.length < 2)
    throw new Error("请填写拒绝或下架原因");
  busy = true;
  document
    .querySelectorAll("#review-dialog button")
    .forEach((b) => (b.disabled = true));
  $("decision-status").textContent =
    action === "approve"
      ? "正在核对文件并发布，完成前不会加入下载列表…"
      : "正在保存审核决定…";
  try {
    await api("/api/admin/submissions/" + selected.id + "/" + action, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    await refresh();
    $("review-dialog").close();
    toast("操作已完成");
  } catch (e) {
    $("decision-status").textContent = "操作未完成：" + e.message;
    throw e;
  } finally {
    busy = false;
    document
      .querySelectorAll("#review-dialog button")
      .forEach((b) => (b.disabled = false));
  }
}
async function setupStatus() {
  const s = await api("/api/setup/status");
  $("setup-status").textContent = s.installed
    ? "GitHub App 已连接并安装，可使用管理员账号登录。"
    : s.connected
      ? "应用已创建，请继续安装到两个专用仓库。"
      : "尚未连接 GitHub App。";
  $("setup-button").hidden = s.connected;
  $("setup-key-label").hidden = s.connected;
  $("install-link").hidden = !s.installUrl;
  if (s.installUrl) $("install-link").href = s.installUrl;
}
async function connectApp() {
  const token = $("setup-key").value.trim();
  if (!token) throw new Error("请填写首次配置凭证");
  const data = await api("/api/setup/manifest", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: "{}",
  });
  const form = document.createElement("form");
  form.method = "POST";
  form.action = data.action;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "manifest";
  input.value = JSON.stringify(data.manifest);
  form.append(input);
  document.body.append(form);
  form.submit();
}
$("mcu").addEventListener("change", () => {
  const custom = $("mcu").value === "custom";
  $("custom-label").hidden = !custom;
  $("custom-mcu").required = custom;
});
$("hex").addEventListener(
  "change",
  run((e) => selectHex(e.target.files[0])),
);
for (const side of ["front", "back"])
  $(side).addEventListener(
    "change",
    run((e) => photo(side, e.target.files[0])),
  );
$("submission-form").addEventListener("submit", run(submit));
$("search").addEventListener("input", renderLibrary);
$("mcu-filter").addEventListener("change", renderLibrary);
$("review-filter").addEventListener("change", renderReview);
$("refresh-mine").addEventListener("click", run(refreshMine));
$("setup-button").addEventListener("click", run(connectApp));
$("logout").addEventListener(
  "click",
  run(async () => {
    await api("/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": auth.csrf },
      body: "{}",
    });
    location.reload();
  }),
);
document.addEventListener(
  "click",
  run((e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.dataset.go) location.hash = button.dataset.go;
    if (button.hasAttribute("data-refresh")) return refresh();
    if (button.dataset.download) downloadStart(button.dataset.download);
    if (button.dataset.review) return review(button.dataset.review);
    if (button.dataset.receipt) {
      const v = receipts().find((v) => v.id === button.dataset.receipt);
      if (v) receiptFile(v);
    }
  }),
);
$("download-agree").addEventListener("change", updateDownload);
$("download-confirm").addEventListener("click", run(download));
$("download-cancel").addEventListener("click", () => {
  if (!seconds) $("download-dialog").close();
});
$("download-dialog").addEventListener("cancel", (e) => {
  if (seconds) e.preventDefault();
});
$("download-dialog").addEventListener("close", () => clearInterval(interval));
$("review-close").addEventListener("click", () => {
  if (!busy) $("review-dialog").close();
});
$("review-dialog").addEventListener("cancel", (e) => {
  if (busy) e.preventDefault();
});
for (const action of ["approve", "reject", "withdraw"])
  $(action).addEventListener(
    "click",
    run(() => decision(action)),
  );
$("night").checked = localStorage.getItem("konz-cloud-night") === "true";
document.body.dataset.night = String($("night").checked);
$("night").addEventListener("change", () => {
  document.body.dataset.night = String($("night").checked);
  localStorage.setItem("konz-cloud-night", String($("night").checked));
});
window.addEventListener("hashchange", route);
route();
try {
  config = await api("/api/config");
  auth = await api("/api/session");
  $("login").hidden = auth.admin;
  $("logout").hidden = !auth.admin;
  $("review-login").hidden = auth.admin;
  $("connection").textContent = "已连接独立云服务";
  $("service-status").textContent = config.submissionsEnabled
    ? "云端在线 · 投稿已开放"
    : "云端在线 · 投稿待开放";
  if (config.submissionsEnabled && config.turnstileSiteKey) {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.onload = () =>
      window.turnstile.render("#turnstile", {
        sitekey: config.turnstileSiteKey,
        action: "backup-submit",
        callback: (token) => {
          turnstileToken = token;
          updateSubmit();
        },
        "expired-callback": () => {
          turnstileToken = "";
          updateSubmit();
        },
      });
    document.head.append(script);
  } else
    $("upload-info").textContent =
      "投稿暂未开放，正在完成 GitHub 与人机验证配置。";
  await refresh();
  updateSubmit();
} catch (e) {
  $("connection").textContent = "云服务暂时不可用";
  $("service-status").textContent = "连接失败";
  error(e);
}
