const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  pending: "待审核",
  publishing: "发布中",
  published: "已发布",
  rejected: "已拒绝",
  withdrawn: "已下架",
};
const titles = {
  library: "飞控备份下载",
  submit: "飞控备份投稿",
  mine: "投稿进度",
  review: "云端审核",
  guide: "流程与说明",
};
const themes = {
  default: ["#fafafa", "#191b20"],
  blue: ["#edf4fa", "#1a242f"],
  green: ["#edf5ee", "#1d2923"],
  purple: ["#f3eef8", "#282233"],
  peach: ["#fcf1eb", "#30241f"],
  sand: ["#f7f3e8", "#2d291f"],
};
let db,
  records = [],
  currentPage = "",
  detailId = "",
  decision = null,
  selectedHex = null;
let photos = { front: null, back: null },
  photoTasks = { front: 0, back: 0 },
  hexTask = 0,
  photoBusy = 0;
let saving = false,
  timer = null,
  seconds = 0,
  downloadId = "",
  toastTimer,
  theme = "default",
  night = false;
const stamp = () => new Date().toISOString();
const displayTime = (s) =>
  new Date(s).toLocaleString("zh-CN", { hour12: false });
const badge = (s) => '<span class="badge ' + s + '">' + labels[s] + "</span>";
const bytes = (n) =>
  n >= 1048576
    ? (n / 1048576).toFixed(2) + " MiB"
    : (n / 1024).toFixed(1) + " KiB";
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4200);
}
function errorText(e) {
  return e instanceof Error ? e.message : String(e);
}
function tellError(e) {
  console.error(e);
  toast("操作未完成：" + errorText(e));
}
function run(fn) {
  return (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch(tellError);
}
function prefRead() {
  try {
    const p = JSON.parse(
      localStorage.getItem("konz-backup-demo-appearance") || "{}",
    );
    theme = themes[p.theme] ? p.theme : "default";
    night = !!p.night;
  } catch {}
}
function applyAppearance() {
  document.body.dataset.night = String(night);
  document.body.style.setProperty("--bg", themes[theme][night ? 1 : 0]);
  $("night").checked = night;
  document
    .querySelectorAll("[data-theme]")
    .forEach((el) =>
      el.setAttribute("aria-pressed", String(el.dataset.theme === theme)),
    );
  try {
    localStorage.setItem(
      "konz-backup-demo-appearance",
      JSON.stringify({ theme, night }),
    );
  } catch {}
}
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("konz-backup-review-demo-v1", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("records", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error("浏览器不允许本地存储，请在正常浏览模式中打开。"));
  });
}
function getAll() {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("records", "readonly")
      .objectStore("records")
      .getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function writeRows(rows, clear = false) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    if (clear) store.clear();
    for (const row of rows) store.put(row);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("本地保存中断，请重试。"));
  });
}
async function refresh() {
  records = await getAll();
  renderAll();
}
function seeds() {
  const base = {
    brand: "演示品牌",
    hardware: "V1.0",
    mcu: "STM32F405",
    capacity: 1024,
    firmware: "Betaflight 4.5.1",
    target: "DEMO_ONLY",
    note: "虚构的演示板型，仅用于验证投稿与审核流程。请勿用作真实硬件适配依据。",
    isExample: true,
    isMine: false,
    hexName: "示例占位材料（非固件）",
    hexSize: 0,
    hexHash: null,
    imageHash: null,
    validation: "演示材料占位，未进行真实固件校验",
    photos: {
      front: { src: "assets/photo-front.jpg", name: "拍摄参考正面" },
      back: { src: "assets/photo-back.jpg", name: "拍摄参考背面" },
    },
    reason: "",
    createdAt: stamp(),
    updatedAt: stamp(),
  };
  return [
    {
      ...structuredClone(base),
      id: "DEMO-0001",
      model: "F405 演示型号 A",
      state: "published",
      publishedAt: stamp(),
      history: [{ at: stamp(), text: "预置已发布示例；配图仅为拍摄参考" }],
    },
    {
      ...structuredClone(base),
      id: "DEMO-0002",
      model: "F722 演示型号 B",
      mcu: "STM32F722",
      capacity: 512,
      state: "pending",
      history: [{ at: stamp(), text: "预置待审核示例" }],
    },
    {
      ...structuredClone(base),
      id: "DEMO-0003",
      model: "F405 演示型号 C",
      state: "pending",
      history: [{ at: stamp(), text: "预置待审核示例" }],
    },
    {
      ...structuredClone(base),
      id: "DEMO-0004",
      model: "F411 演示型号 D",
      mcu: "STM32F411",
      capacity: 512,
      state: "rejected",
      reason: "演示：照片中的硬件版本与填写内容不一致，请核对后重新投稿。",
      history: [{ at: stamp(), text: "预置拒绝示例" }],
    },
  ];
}
function navigate(page) {
  location.hash = page;
}
function route() {
  const page = location.hash.slice(1);
  currentPage = titles[page] ? page : "library";
  document
    .querySelectorAll(".page")
    .forEach((el) => (el.hidden = el.id !== "page-" + currentPage));
  document
    .querySelectorAll("[data-page]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.page === currentPage),
    );
  $("page-title").textContent = titles[currentPage];
  renderAll();
  window.scrollTo({ top: 0 });
}
function stat(label, count) {
  return (
    '<div class="stat"><span>' +
    label +
    "</span><strong>" +
    count +
    "</strong></div>"
  );
}
function stats() {
  const counts = {};
  for (const s of Object.keys(labels))
    counts[s] = records.filter((r) => r.state === s).length;
  $("library-stats").innerHTML =
    stat("已审核发布", counts.published) +
    stat(
      "覆盖主控类型",
      new Set(records.filter((r) => r.state === "published").map((r) => r.mcu))
        .size,
    ) +
    stat("每份实物照片", "2") +
    stat("下载阅读提醒", "10s");
  $("review-stats").innerHTML =
    stat("待审核", counts.pending) +
    stat("已发布", counts.published) +
    stat("已拒绝", counts.rejected) +
    stat("已下架", counts.withdrawn);
  $("pending-count").textContent = counts.pending;
  $("mine-count").textContent = records.filter((r) => r.isMine).length;
}
function matches(r, q) {
  return [r.id, r.brand, r.model, r.firmware, r.hardware, r.mcu]
    .join(" ")
    .toLowerCase()
    .includes(q.trim().toLowerCase());
}
function rowInfo(r) {
  return (
    "<td><b>" +
    esc(r.model) +
    "</b><small>" +
    esc(r.brand) +
    " · " +
    esc(r.hardware) +
    "</small><small>" +
    esc(r.id) +
    "</small></td><td>" +
    esc(r.mcu) +
    "<small>" +
    esc(r.firmware) +
    " · " +
    r.capacity +
    " KiB</small></td>"
  );
}
function renderLibrary() {
  let list = records.filter(
    (r) =>
      r.state === "published" &&
      matches(r, $("library-search").value) &&
      (!$("library-mcu").value || r.mcu === $("library-mcu").value),
  );
  list.sort(
    $("library-sort").value === "model"
      ? (a, b) => a.model.localeCompare(b.model, "zh-CN")
      : (a, b) => b.publishedAt.localeCompare(a.publishedAt),
  );
  $("library-body").innerHTML = list
    .map(
      (r) =>
        "<tr>" +
        rowInfo(r) +
        "<td>2 张照片<small>" +
        (r.isExample ? "演示参考图" : "本地提交材料") +
        "</small></td><td>" +
        badge(r.state) +
        "<small>" +
        displayTime(r.publishedAt) +
        '</small></td><td><div class="buttons"><button data-detail="' +
        r.id +
        '" data-context="library">查看详情</button><button class="soft" data-download="' +
        r.id +
        '">下载演示</button></div></td></tr>',
    )
    .join("");
  $("library-empty").hidden = list.length > 0;
}
function renderReview() {
  const filter = $("review-filter").value;
  const list = records
    .filter(
      (r) =>
        (filter === "all" || r.state === filter) &&
        matches(r, $("review-search").value),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("review-body").innerHTML = list
    .map(
      (r) =>
        "<tr>" +
        rowInfo(r) +
        "<td>" +
        (r.isExample ? "示例占位材料" : "HEX 格式已检查") +
        "<small>2 张照片 · " +
        (r.isExample ? "参考图" : "本地材料") +
        "</small></td><td>" +
        badge(r.state) +
        '</td><td><button class="soft" data-detail="' +
        r.id +
        '" data-context="review">' +
        (r.state === "pending" ? "查看并审核" : "查看记录") +
        "</button></td></tr>",
    )
    .join("");
  $("review-empty").hidden = list.length > 0;
}
function renderMine() {
  const list = records
    .filter((r) => r.isMine)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("mine-list").innerHTML = list.length
    ? list
        .map(
          (r) =>
            '<article class="card submission-item"><div><h3>' +
            esc(r.model) +
            " " +
            badge(r.state) +
            '</h3><p class="muted">' +
            esc(r.id) +
            " · 提交于 " +
            displayTime(r.createdAt) +
            "</p><p>" +
            esc(r.brand) +
            " · " +
            esc(r.hardware) +
            " · " +
            esc(r.firmware) +
            "</p>" +
            (r.reason
              ? '<p class="reason">' +
                (r.state === "rejected" ? "拒绝原因：" : "下架原因：") +
                esc(r.reason) +
                "</p>"
              : "") +
            '</div><button data-detail="' +
            r.id +
            '" data-context="mine">查看材料与记录</button></article>',
        )
        .join("")
    : '<div class="card empty">还没有本机投稿。<button class="soft" data-go="submit">去提交第一份备份</button></div>';
}
function renderAll() {
  stats();
  renderLibrary();
  renderReview();
  renderMine();
}
function checkHex(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || lines.length > 200000)
    throw new Error("HEX 记录数量不合法。");
  let eof = false,
    upper = 0,
    total = 0,
    start = Infinity,
    end = 0;
  const segments = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!/^:[0-9a-f]+$/i.test(line) || (line.length - 1) % 2)
      throw new Error("第 " + (idx + 1) + " 行不是合法 Intel HEX 记录。");
    const data = new Uint8Array((line.length - 1) / 2);
    for (let i = 0; i < data.length; i++)
      data[i] = parseInt(line.slice(1 + i * 2, 3 + i * 2), 16);
    if (
      data.length < 5 ||
      data.length !== data[0] + 5 ||
      data.reduce((a, b) => a + b, 0) % 256
    )
      throw new Error("第 " + (idx + 1) + " 行长度或校验和错误。");
    if (eof) throw new Error("EOF 后存在额外记录。");
    const length = data[0],
      offset = data[1] * 256 + data[2],
      type = data[3];
    if (type === 0) {
      if (!length) continue;
      if (offset + length > 65536)
        throw new Error("数据记录越过 64 KiB 边界。");
      const address = upper + offset;
      if (address < 0x08000000 || address + length > 0x08400000)
        throw new Error("演示校验仅接受 0x08000000 起的内部 Flash 地址范围。");
      segments.push({ address, data: data.slice(4, 4 + length) });
      total += length;
      start = Math.min(start, address);
      end = Math.max(end, address + length);
      if (total > 4 * 1048576) throw new Error("解码数据超过演示上限 4 MiB。");
    } else if (type === 1) {
      if (length !== 0 || offset !== 0) throw new Error("EOF 记录格式错误。");
      eof = true;
    } else if (type === 4) {
      if (length !== 2 || offset !== 0)
        throw new Error("扩展线性地址格式错误。");
      upper = (data[4] * 256 + data[5]) * 65536;
    } else if (type === 2) {
      if (length !== 2 || offset !== 0) throw new Error("扩展段地址格式错误。");
      upper = (data[4] * 256 + data[5]) * 16;
    } else if (type === 3 || type === 5) {
      if (length !== 4 || offset !== 0)
        throw new Error("启动地址记录格式错误。");
    } else throw new Error("不支持的 HEX 记录类型。");
  }
  if (!eof || !total) throw new Error("缺少 EOF 或有效数据。");
  segments.sort((a, b) => a.address - b.address);
  let cursor = start;
  for (const seg of segments) {
    if (seg.address < cursor) throw new Error("HEX 包含重叠地址。");
    if (seg.address > cursor)
      throw new Error("此文件有地址空洞，不符合本 Demo 的连续备份检查。");
    cursor = seg.address + seg.data.length;
  }
  if (start !== 0x08000000) throw new Error("完整备份必须从 0x08000000 开始。");
  const image = new Uint8Array(total);
  let offset = 0;
  for (const seg of segments) {
    image.set(seg.data, offset);
    offset += seg.data.length;
  }
  return { total, start, end, image };
}
async function sha256(data) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function fileStatus(message, kind = "") {
  $("hex-status").textContent = message;
  $("hex-status").className = "file-status " + kind;
}
async function chooseHex(file) {
  const task = ++hexTask;
  selectedHex = null;
  for (const side of ["front", "back"]) {
    if (photos[side]?.src.startsWith("assets/")) setPhoto(side, null);
  }
  if (!file) {
    fileStatus("尚未选择文件。");
    return;
  }
  fileStatus("正在本地检查文件…");
  try {
    if (!/\.hex$/i.test(file.name)) throw new Error("请选择 .hex 文件。");
    if (file.size > 12 * 1048576) throw new Error("HEX 文件不得超过 12 MiB。");
    const buffer = await file.arrayBuffer();
    const checked = checkHex(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
    );
    const [hexHash, imageHash] = await Promise.all([
      sha256(buffer),
      sha256(checked.image),
    ]);
    if (task !== hexTask) return;
    selectedHex = {
      name: file.name,
      size: file.size,
      hexHash,
      imageHash,
      total: checked.total,
      buffer,
      isExample: false,
    };
    fileStatus(
      file.name +
        " · " +
        bytes(file.size) +
        " · 连续数据 " +
        bytes(checked.total) +
        " · 格式与校验和通过",
      "good",
    );
  } catch (e) {
    if (task === hexTask) fileStatus(errorText(e), "bad");
  }
}
function setPhoto(side, value) {
  photos[side] = value;
  $(side + "-preview").hidden = !value;
  $(side + "-placeholder").hidden = !!value;
  if (value) $(side + "-preview").src = value.src;
  else $(side + "-preview").removeAttribute("src");
}
async function choosePhoto(side, file) {
  const task = ++photoTasks[side];
  setPhoto(side, null);
  if (!file) return;
  photoBusy++;
  try {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("照片仅支持 JPG、PNG 或 WebP。");
    if (file.size > 8 * 1048576) throw new Error("单张照片不得超过 8 MiB。");
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 40000000)
        throw new Error("照片像素过大，请先缩小。");
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (task === photoTasks[side])
        setPhoto(side, {
          src: canvas.toDataURL("image/jpeg", 0.83),
          name: file.name,
        });
    } finally {
      bitmap.close();
    }
  } catch (e) {
    if (task === photoTasks[side]) toast(errorText(e));
  } finally {
    photoBusy--;
  }
}
function fillExample() {
  if (saving) return;
  ++hexTask;
  ++photoTasks.front;
  ++photoTasks.back;
  const form = $("submission-form");
  form.reset();
  const data = {
    brand: "演示品牌",
    model: "F405 我的演示投稿",
    hardware: "V2.0",
    mcu: "STM32F405",
    capacity: "1024",
    firmware: "Betaflight 4.5.1",
    target: "DEMO_ONLY",
    note: "这是一份模拟投稿，用于验证提交、审核和下载列表联动。附图是拍摄参考，不代表本板型。",
  };
  for (const [k, v] of Object.entries(data))
    form.elements.namedItem(k).value = v;
  selectedHex = {
    name: "演示占位材料（非固件）",
    size: 0,
    total: 0,
    hexHash: null,
    imageHash: null,
    isExample: true,
  };
  fileStatus("已填入演示占位材料；没有真实 HEX，不可烧录。", "good");
  setPhoto("front", { src: "assets/photo-front.jpg", name: "拍摄参考正面" });
  setPhoto("back", { src: "assets/photo-back.jpg", name: "拍摄参考背面" });
  $("form-error").hidden = true;
  toast("演示材料已填入，请阅读并勾选两项确认。");
}
function formError(message) {
  $("form-error").textContent = message;
  $("form-error").hidden = false;
  $("form-error").scrollIntoView({ block: "center", behavior: "smooth" });
}
async function submit(event) {
  event.preventDefault();
  if (saving) return;
  if (!db) return formError("本地存储尚不可用，请稍后重试。");
  if (!selectedHex)
    return formError("请先选择通过格式检查的 HEX，或填入演示材料。");
  if (photoBusy) return formError("照片还在处理中，请稍候。");
  if (!photos.front || !photos.back)
    return formError("请附上正面和背面两张照片。");
  const form = $("submission-form");
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(data)) data[key] = data[key].trim();
  if (["brand", "model", "hardware", "firmware", "note"].some((k) => !data[k]))
    return formError("必填内容不能只包含空格。");
  if (
    !selectedHex.isExample &&
    selectedHex.total !== Number(data.capacity) * 1024
  )
    return formError(
      "解码数据长度与填写的 Flash 容量不一致，请核对完整备份和容量。",
    );
  saving = true;
  $("submit-button").disabled = true;
  try {
    const id =
      "LOCAL-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      crypto.randomUUID().slice(0, 4).toUpperCase();
    const row = {
      ...data,
      id,
      capacity: Number(data.capacity),
      state: "pending",
      isMine: true,
      isExample: selectedHex.isExample,
      hexName: selectedHex.name,
      hexSize: selectedHex.size,
      hexHash: selectedHex.hexHash,
      imageHash: selectedHex.imageHash,
      hexBuffer: selectedHex.buffer || null,
      photos: structuredClone(photos),
      validation: selectedHex.isExample
        ? "演示占位，未进行真实固件校验"
        : "本地格式、记录校验和、地址连续性和容量检查通过；未验证固件兼容性",
      reason: "",
      createdAt: stamp(),
      updatedAt: stamp(),
      history: [{ at: stamp(), text: "本地提交成功，进入模拟待审核队列" }],
    };
    await writeRows([row]);
    await refresh();
    form.reset();
    selectedHex = null;
    setPhoto("front", null);
    setPhoto("back", null);
    fileStatus("尚未选择文件。");
    $("form-error").hidden = true;
    navigate("mine");
    toast("已保存到本机待审核队列；可前往“云端审核”验证。");
  } catch (e) {
    formError("本地保存失败，尚未提交：" + errorText(e));
  } finally {
    saving = false;
    $("submit-button").disabled = false;
  }
}
function findRecord(id) {
  return records.find((r) => r.id === id);
}
function detail(id, context = "library") {
  const r = findRecord(id);
  if (!r) return;
  detailId = id;
  $("detail-title").textContent = r.model;
  $("detail-eyebrow").textContent =
    r.id + " / " + (context === "review" ? "管理员审核 · 模拟" : "材料详情");
  const fields = [
    ["品牌", r.brand],
    ["硬件版本", r.hardware],
    ["主控", r.mcu],
    ["Flash 容量", r.capacity + " KiB"],
    ["固件版本", r.firmware],
    ["Target", r.target || "未知 / 未填写"],
  ];
  $("detail-content").innerHTML =
    (r.isExample
      ? '<div class="notice"><b>此条为演示材料</b><p>虚构型号，配图仅是拍摄参考，没有真实可用固件。</p></div>'
      : "") +
    "<div>" +
    badge(r.state) +
    ' <span class="small muted">提交于 ' +
    displayTime(r.createdAt) +
    '</span></div><dl class="metadata">' +
    fields
      .map(([k, v]) => "<div><dt>" + k + "</dt><dd>" + esc(v) + "</dd></div>")
      .join("") +
    '</dl><p class="detail-note">' +
    esc(r.note) +
    "</p><h3>两张照片" +
    (r.isExample ? " · 拍摄参考" : " · 本地投稿材料") +
    '</h3><div class="detail-photos">' +
    ["front", "back"]
      .map(
        (s, i) =>
          '<button data-photo="' +
          esc(r.photos[s].src) +
          '" data-caption="' +
          esc(
            (i ? "背面" : "正面") +
              (r.isExample ? " · 演示拍摄参考" : " · 本地投稿照片"),
          ) +
          '"><img src="' +
          esc(r.photos[s].src) +
          '" alt="' +
          (i ? "背面" : "正面") +
          '照片"><span>' +
          esc(r.photos[s].name) +
          " · 点击放大</span></button>",
      )
      .join("") +
    '</div><h3 style="margin-top:22px">文件检查</h3><p class="small">' +
    esc(r.validation) +
    '</p><div class="hash">HEX 文件：' +
    esc(r.hexName) +
    "<br>HEX 文件 SHA-256：" +
    esc(r.hexHash || "演示占位，无真实校验值") +
    "<br>原始 Flash SHA-256：" +
    esc(r.imageHash || "演示占位，无真实校验值") +
    "</div>" +
    (r.reason
      ? '<p class="red small"><b>处理原因：</b>' + esc(r.reason) + "</p>"
      : "") +
    '<h3>处理记录</h3><ul class="timeline">' +
    r.history
      .map((h) => "<li>" + displayTime(h.at) + "　" + esc(h.text) + "</li>")
      .join("") +
    "</ul>";
  let actions = '<button class="left" data-close="detail-dialog">关闭</button>';
  if (context === "review" && r.state === "pending")
    actions +=
      '<button class="danger" data-decision="reject" data-id="' +
      r.id +
      '">拒绝投稿</button><button class="primary" data-decision="approve" data-id="' +
      r.id +
      '">通过并模拟发布</button>';
  else if (context === "review" && r.state === "published")
    actions +=
      '<button class="danger" data-decision="withdraw" data-id="' +
      r.id +
      '">下架备份</button>';
  else if (context === "library" && r.state === "published")
    actions +=
      '<button class="primary" data-download="' +
      r.id +
      '">下载演示说明</button>';
  $("detail-actions").innerHTML = actions;
  if (!$("detail-dialog").open) $("detail-dialog").showModal();
}
function openDecision(action, id) {
  const row = findRecord(id);
  if (!row || row.state !== (action === "withdraw" ? "published" : "pending"))
    return toast("记录状态已改变，请刷新后重试。");
  decision = { action, id };
  const approve = action === "approve";
  $("decision-title").textContent = approve
    ? "通过并模拟发布？"
    : action === "reject"
      ? "拒绝这份投稿？"
      : "下架这份备份？";
  $("decision-description").textContent =
    row.model +
    " · " +
    row.id +
    (approve
      ? "。确认后先模拟发布材料，再加入下载列表。"
      : action === "withdraw"
        ? "。下架后会从公开下载列表移除。"
        : "。拒绝后不会进入公开下载列表。");
  $("decision-check-wrap").hidden = !approve;
  $("decision-reason-wrap").hidden = approve;
  $("decision-check").checked = false;
  $("decision-check").required = approve;
  $("decision-reason").value = "";
  $("decision-reason").required = !approve;
  $("decision-error").hidden = true;
  $("decision-dialog").showModal();
}
async function executeDecision(event) {
  event.preventDefault();
  if (saving || !decision) return;
  const { action, id } = decision;
  const current = findRecord(id);
  if (!current) return;
  const approve = action === "approve";
  const reason = $("decision-reason").value.trim();
  if (approve && !$("decision-check").checked) return;
  if (!approve && !reason) {
    $("decision-error").textContent = "请填写原因，不能只输入空格。";
    $("decision-error").hidden = false;
    return;
  }
  if (current.state !== (action === "withdraw" ? "published" : "pending"))
    return toast("当前状态不允许此操作。");
  saving = true;
  $("decision-confirm").disabled = true;
  try {
    const row = structuredClone(current);
    row.updatedAt = stamp();
    row.reason = reason;
    if (approve) {
      row.state = "publishing";
      row.history.push({ at: stamp(), text: "审核通过，开始模拟发布" });
      await writeRows([row]);
      await refresh();
      $("decision-confirm").textContent = "正在模拟发布…";
      await new Promise((resolve) => setTimeout(resolve, 900));
      row.state = "published";
      row.publishedAt = stamp();
      row.history.push({
        at: stamp(),
        text: "模拟发布完成，已加入本机公开列表",
      });
    } else {
      row.state = action === "reject" ? "rejected" : "withdrawn";
      row.history.push({
        at: stamp(),
        text: (action === "reject" ? "拒绝投稿：" : "已下架：") + reason,
      });
    }
    await writeRows([row]);
    await refresh();
    $("decision-dialog").close();
    $("detail-dialog").close();
    toast(
      approve
        ? "模拟发布完成，已进入“飞控备份下载”。"
        : action === "reject"
          ? "已拒绝投稿，原因已记录。"
          : "已下架，下载列表不再展示。",
    );
  } catch (e) {
    $("decision-error").textContent = "操作失败：" + errorText(e);
    $("decision-error").hidden = false;
    await refresh();
  } finally {
    saving = false;
    $("decision-confirm").disabled = false;
    $("decision-confirm").textContent = "确认";
  }
}
function openPhoto(src, caption) {
  $("photo-large").src = src;
  $("photo-caption").textContent = caption || "照片预览";
  $("photo-dialog").showModal();
}
function startDownload(id) {
  const r = findRecord(id);
  if (!r || r.state !== "published") return toast("此记录当前不可下载。");
  downloadId = id;
  seconds = 10;
  $("download-model").textContent = r.model + " · " + r.hardware;
  $("download-agree").checked = false;
  $("download-cancel").disabled = true;
  $("download-confirm").disabled = true;
  $("download-timer").textContent = "10s";
  $("download-confirm").textContent = "请阅读 10s";
  $("download-dialog").showModal();
  clearInterval(timer);
  const started = Date.now();
  timer = setInterval(() => {
    seconds = Math.max(0, 10 - Math.floor((Date.now() - started) / 1000));
    $("download-timer").textContent = seconds + "s";
    $("download-cancel").disabled = seconds > 0;
    updateDownload();
    if (!seconds) clearInterval(timer);
  }, 200);
}
function updateDownload() {
  $("download-confirm").disabled = seconds > 0 || !$("download-agree").checked;
  $("download-confirm").textContent =
    seconds > 0 ? "请阅读 " + seconds + "s" : "下载演示说明 TXT";
}
function download() {
  const row = findRecord(downloadId);
  if (
    seconds ||
    !$("download-agree").checked ||
    !row ||
    row.state !== "published"
  )
    return;
  const blob = new Blob(
    [
      "KONz 云备份交互演示\r\n这不是固件，不能用于烧录。\r\n\r\n备份编号：" +
        row.id +
        "\r\n演示型号：" +
        row.model +
        "\r\n此文件仅用于验证下载交互。真正的 HEX 下载将在云端服务完成后接入。",
    ],
    { type: "text/plain;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = row.id + "-演示说明-非固件.txt";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("download-dialog").close();
  toast("已下载演示说明 TXT，不是固件。");
}
async function reset() {
  if (saving) return toast("正在保存，请稍候。");
  saving = true;
  $("reset-confirm").disabled = true;
  try {
    await writeRows(seeds(), true);
    await refresh();
    $("reset-dialog").close();
    toast("演示数据已重置。");
  } finally {
    saving = false;
    $("reset-confirm").disabled = false;
  }
}
async function recoverPublishing() {
  const rows = await getAll();
  const interrupted = rows.filter((r) => r.state === "publishing");
  for (const row of interrupted) {
    row.state = "pending";
    row.history.push({
      at: stamp(),
      text: "页面刷新中断了模拟发布，已退回待审核，可重新操作",
    });
  }
  if (interrupted.length) await writeRows(interrupted);
}
document.addEventListener(
  "click",
  run(async (event) => {
    const b = event.target.closest("button,[data-go]");
    if (!b) return;
    if (b.dataset.go) return navigate(b.dataset.go);
    if (b.dataset.close) {
      if (saving && b.dataset.close === "decision-dialog") return;
      $(b.dataset.close).close();
      return;
    }
    if (b.dataset.detail) return detail(b.dataset.detail, b.dataset.context);
    if (b.dataset.decision)
      return openDecision(b.dataset.decision, b.dataset.id);
    if (b.dataset.download) return startDownload(b.dataset.download);
    if (b.dataset.photo) return openPhoto(b.dataset.photo, b.dataset.caption);
    if (b.dataset.theme) {
      theme = b.dataset.theme;
      applyAppearance();
    }
  }),
);
$("night").addEventListener("change", () => {
  night = $("night").checked;
  applyAppearance();
});
$("hex-file").addEventListener(
  "change",
  run((event) => chooseHex(event.target.files[0])),
);
for (const side of ["front", "back"])
  $(side + "-file").addEventListener(
    "change",
    run((event) => choosePhoto(side, event.target.files[0])),
  );
$("fill-example").addEventListener("click", fillExample);
$("submission-form").addEventListener("submit", run(submit));
$("decision-form").addEventListener("submit", run(executeDecision));
for (const id of ["library-search", "library-mcu", "library-sort"])
  $(id).addEventListener(
    id.includes("search") ? "input" : "change",
    renderLibrary,
  );
for (const id of ["review-search", "review-filter"])
  $(id).addEventListener(
    id.includes("search") ? "input" : "change",
    renderReview,
  );
$("refresh-library").addEventListener(
  "click",
  run(async () => {
    await refresh();
    toast("已刷新本地公开列表。");
  }),
);
$("refresh-review").addEventListener(
  "click",
  run(async () => {
    await refresh();
    toast("已刷新本地审核队列。");
  }),
);
$("clear-filter").addEventListener("click", () => {
  $("library-search").value = "";
  $("library-mcu").value = "";
  renderLibrary();
});
$("download-agree").addEventListener("change", updateDownload);
$("download-confirm").addEventListener("click", download);
$("download-cancel").addEventListener("click", () => {
  if (!seconds) $("download-dialog").close();
});
$("download-dialog").addEventListener("cancel", (e) => {
  if (seconds) e.preventDefault();
});
$("download-dialog").addEventListener("close", () => clearInterval(timer));
$("decision-dialog").addEventListener("cancel", (e) => {
  if (saving) e.preventDefault();
});
$("reset-demo").addEventListener("click", () => {
  $("reset-dialog").showModal();
});
$("reset-confirm").addEventListener("click", run(reset));
window.addEventListener("hashchange", route);
window.addEventListener("pageshow", () => {
  if (db) run(refresh)();
});
prefRead();
applyAppearance();
route();
try {
  db = await openDb();
  if (!(await getAll()).length) await writeRows(seeds());
  await recoverPublishing();
  await refresh();
  $("storage-status").textContent = "已启用浏览器本地保存";
} catch (e) {
  $("storage-status").textContent = "本地存储不可用";
  $("submit-button").disabled = true;
  toast(errorText(e));
}
