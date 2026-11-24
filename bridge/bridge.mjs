#!/usr/bin/env node
/* Spot Agent · 本地桥
 *
 * 一个进程，两种传输：
 *   1) HTTP  → http://127.0.0.1:8787  给浏览器扩展提交、修改、删除、定位任务
 *   2) stdio → MCP                     给 Qoder 读取队列、标记完成
 *
 * 用法：
 *   node bridge/bridge.mjs                       # 双模（MCP 客户端启动时会走这条）
 *   node bridge/bridge.mjs --http-only           # 只跑 HTTP，调试用
 *   SPOT_ROOT=/path/to/project node bridge/bridge.mjs
 *   SPOT_SANDBOX=/path node bridge/bridge.mjs    # 改沙箱范围（默认 ~/Documents/AI_Projects）
 *
 * 沙箱：所有项目根必须落在 SPOT_SANDBOX 里，否则拒绝写入（HTTP 403 outside-sandbox）。
 *       判定走 realpath，软链接、../ 都绕不出去。
 *
 * 注意：stdout 是 MCP 通道，任何日志都必须走 stderr。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = Number(process.env.SPOT_PORT || 8787);
const HTTP_ONLY = process.argv.includes("--http-only");
const ROOTS_FILE = path.join(HERE, "roots.json");
const MAX_BODY = 4 * 1024 * 1024;
const VERSION = "0.2.0";

/* 沙箱边界：桥只许在这棵目录里读写。
   默认就是你放项目的 AI_Projects，可用 SPOT_SANDBOX 覆盖（测试用）。
   这个值在进程启动时定死，之后任何一次写盘都要过 insideSandbox()。 */
const SANDBOX = (function () {
  const raw = process.env.SPOT_SANDBOX || path.join(process.env.HOME || "/", "Documents", "AI_Projects");
  try { return fs.realpathSync(raw); } catch { return path.resolve(raw); }
})();

const ARG_ROOT = (process.argv.find((a) => a.startsWith("--root=")) || "").slice(7);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stderr.write(
    [
      "Spot Agent 本地桥 " + VERSION,
      "",
      "  node bridge/bridge.mjs                  HTTP + MCP（给 Qoder 用这条）",
      "  node bridge/bridge.mjs --http-only      只跑 HTTP，调试用",
      "  node bridge/bridge.mjs --root=/path     指定任务落到哪个项目",
      "",
      "  环境变量：SPOT_ROOT / SPOT_PORT / SPOT_SANDBOX",
      "  沙箱：默认 ~/Documents/AI_Projects，项目根越界一律拒绝（403 outside-sandbox）",
      "  HTTP：POST /ping /submit /update /delete /clear /reveal /queue /done（仅 127.0.0.1）",
      "  MCP ：spot_list_prompts / spot_read_prompt / spot_mark_done / spot_status",
      ""
    ].join("\n")
  );
  process.exit(0);
}

function log(msg) {
  process.stderr.write("[spot-bridge] " + msg + "\n");
}

/* ---------------- 文件与根目录 ---------------- */

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

function safeDir(p) {
  try {
    const real = fs.realpathSync(p);
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/* 解析成"真实路径"，且允许末尾几层还不存在——写入前就得判定，
   不能等 mkdirSync 之后才发现越界。做法是往上找到第一个存在的祖先做
   realpath，再把剩下的段接回去。软链接绕出去、../ 穿越都在这一步被摊平。 */
function realish(p) {
  let cur = path.resolve(p);
  const tail = [];
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(cur)) {
      let real;
      try { real = fs.realpathSync(cur); } catch { return null; }
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    }
    tail.push(path.basename(cur));
    const up = path.dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
  return null;
}

/* 路径是否在沙箱里。注意 "/" 结尾要单独处理，否则 SPOT_SANDBOX=/ 会全线失守 */
function insideSandbox(p) {
  const real = realish(p);
  if (!real) return false;
  const prefix = SANDBOX.endsWith(path.sep) ? SANDBOX : SANDBOX + path.sep;
  return real === SANDBOX || real.startsWith(prefix);
}

class OutsideSandbox extends Error {
  constructor(p) {
    super("落点不在允许范围：" + p + "（沙箱 " + SANDBOX + "）");
    this.code = "outside-sandbox";
    this.path = p;
  }
}

/* 从 file:// 页面地址反推项目根：就近找项目标记，谁近用谁。
   顺序有讲究——你的所有项目都躺在同一个 git 仓（AI_Projects/.git）里，
   只认 .git 会把每个页面的任务都吸到那个共同父目录，而不是各自的项目文件夹。
   .spot-root / .qoder 是"这一层就是一个项目"的显式声明，比外层 .git 更可信。 */
const ROOT_MARKERS = [".spot-root", ".qoder", ".git"];

function rootFromUrl(url) {
  if (!url || !String(url).startsWith("file://")) return null;
  try {
    const file = decodeURIComponent(new URL(url).pathname);
    if (!fs.existsSync(file)) return null;
    const dir = path.dirname(file);
    let cur = dir;
    for (let i = 0; i < 8; i++) {
      for (const marker of ROOT_MARKERS) {
        if (fs.existsSync(path.join(cur, marker))) return cur;
      }
      const up = path.dirname(cur);
      if (up === cur) break;
      cur = up;
    }
    return dir;
  } catch {
    return null;
  }
}

function resolveRoot(payload) {
  const explicit = process.env.SPOT_ROOT || ARG_ROOT;
  let cand = null;

  if (explicit) {
    cand = safeDir(explicit);
    if (!cand) log("SPOT_ROOT 无效：" + explicit);
  }
  if (!cand) {
    const fromUrl = rootFromUrl(payload && payload.url);
    if (fromUrl) cand = safeDir(fromUrl) || fromUrl;
  }
  if (!cand) cand = safeDir(process.cwd()) || process.cwd();

  /* 唯一的出口：越界就抛，绝不"就近塞进沙箱"——那会把别的项目的任务
     错落到 AI_Projects 根上，比直接拒绝更难查 */
  const real = realish(cand) || cand;
  if (!insideSandbox(real)) throw new OutsideSandbox(real);
  return real;
}

function rememberRoot(root) {
  const data = readJson(ROOTS_FILE, { roots: [] });
  if (!Array.isArray(data.roots)) data.roots = [];
  if (!data.roots.includes(root)) {
    data.roots.push(root);
    writeJson(ROOTS_FILE, data);
  }
  return root;
}

function knownRoots() {
  const data = readJson(ROOTS_FILE, { roots: [] });
  const roots = Array.isArray(data.roots) ? data.roots.slice() : [];
  const explicit = process.env.SPOT_ROOT || ARG_ROOT;
  if (explicit) {
    const r = safeDir(explicit);
    if (r && !roots.includes(r)) roots.unshift(r);
  }
  /* 沙箱外的旧根一律不认：那是别人（或以前测试）留下的记录，不能让它
     把 MCP 的读、写、mark_done 引到 AI_Projects 外面去 */
  return roots.filter((r) => !!safeDir(r) && insideSandbox(r));
}

/* 启动时把越界的根从 roots.json 里剔掉，边界自愈，不用手改文件 */
function pruneRoots() {
  const data = readJson(ROOTS_FILE, { roots: [] });
  const list = Array.isArray(data.roots) ? data.roots : [];
  const kept = list.filter((r) => insideSandbox(r));
  if (kept.length !== list.length) {
    writeJson(ROOTS_FILE, { roots: kept });
    log("已剔掉 " + (list.length - kept.length) + " 个沙箱外的旧项目根");
  }
}

function queueFile(root) {
  return path.join(root, ".spot", "queue.json");
}

function loadQueue(root) {
  const q = readJson(queueFile(root), { items: [] });
  if (!Array.isArray(q.items)) q.items = [];
  return q;
}

function slugify(s) {
  return String(s || "page")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "page";
}

/* ---------------- 业务 ---------------- */

function submit(payload) {
  const md = String(payload.md || "");
  if (!md.trim()) throw new Error("prompt 内容为空");

  const root = rememberRoot(resolveRoot(payload));
  const dir = path.join(root, ".spot", "prompts");
  fs.mkdirSync(dir, { recursive: true });

  const id = String(payload.id || "sa-" + Date.now());
  const stamp = id.replace(/^sa-/, "").replace(/[^0-9A-Za-z-]/g, "");
  const file = path.join(dir, stamp + "-" + slugify(payload.title) + ".md");
  fs.writeFileSync(file, md.endsWith("\n") ? md : md + "\n", "utf8");

  const q = loadQueue(root);
  q.items = q.items.filter((it) => it && it.id !== id);
  q.items.unshift({
    id,
    title: payload.title || "",
    url: payload.url || "",
    request: payload.request || "",
    createdAt: payload.createdAt || new Date().toISOString(),
    status: "pending",
    file: path.relative(root, file),
    abs: file
  });
  writeJson(queueFile(root), q);

  log("收到任务 " + id + " → " + path.relative(root, file));
  return { file, root, id };
}

function allItems() {
  const out = [];
  for (const root of knownRoots()) {
    for (const it of loadQueue(root).items) out.push({ ...it, root });
  }
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

function listPrompts(opts) {
  const status = opts && opts.status;
  const limit = Number(opts && opts.limit) || 20;
  const items = allItems()
    .filter((it) => !status || it.status === status)
    .slice(0, limit);
  if (!(opts && opts.withBody)) return items;

  /* 面板要能就地编辑，就得拿到正文；读之前照样过沙箱 */
  return items.map((it) => {
    const abs = it.abs || path.join(it.root, it.file);
    let md = "";
    try { if (insideSandbox(abs)) md = fs.readFileSync(abs, "utf8"); } catch { /* 文件被手删了 */ }
    return { ...it, md };
  });
}

function findItem(id) {
  const key = String(id || "");
  return allItems().find((it) => it.id === key || it.file === key || it.abs === key) || null;
}

function markDone(id, note, status) {
  const target = findItem(id);
  if (!target) throw new Error("找不到任务：" + id);
  const q = loadQueue(target.root);
  for (const it of q.items) {
    if (it.id === target.id) {
      it.status = status || "done";
      it.note = note || "";
      it.doneAt = new Date().toISOString();
    }
  }
  writeJson(queueFile(target.root), q);
  return target;
}

function readPrompt(id) {
  const it = findItem(id);
  if (!it) throw new Error("找不到任务：" + id);
  const abs = it.abs || path.join(it.root, it.file);
  /* queue.json 是可以被手改的，里面的 abs/file 不能当可信输入 */
  if (!insideSandbox(abs)) throw new OutsideSandbox(abs);
  return { item: it, text: fs.readFileSync(abs, "utf8") };
}

/* 改一条已提交的任务：文件原地重写，队列索引跟着改 */
function updateItem(payload) {
  const target = findItem(payload && payload.id);
  if (!target) throw new Error("找不到任务：" + (payload && payload.id));
  const abs = realish(target.abs || path.join(target.root, target.file)) ||
    path.join(target.root, target.file);
  if (!insideSandbox(abs)) throw new OutsideSandbox(abs);

  const md = String((payload && payload.md) || "");
  if (!md.trim()) throw new Error("prompt 内容为空");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, md.endsWith("\n") ? md : md + "\n", "utf8");

  const q = loadQueue(target.root);
  for (const it of q.items) {
    if (it.id !== target.id) continue;
    if (payload.request != null) it.request = String(payload.request);
    if (payload.title != null) it.title = String(payload.title);
    it.updatedAt = new Date().toISOString();
  }
  writeJson(queueFile(target.root), q);
  log("更新任务 " + target.id + " → " + path.relative(target.root, abs));
  return { id: target.id, file: abs, root: target.root };
}

/* 删一条：先删 .md，再摘掉索引条目，两步都不许越界 */
function deleteItem(id) {
  const target = findItem(id);
  if (!target) throw new Error("找不到任务：" + id);
  const abs = target.abs || path.join(target.root, target.file);

  if (insideSandbox(abs) && fs.existsSync(abs)) fs.rmSync(abs, { force: true });
  const q = loadQueue(target.root);
  q.items = q.items.filter((it) => it.id !== target.id);
  writeJson(queueFile(target.root), q);
  log("删除任务 " + target.id);
  return { id: target.id, file: abs, root: target.root };
}

/* 清空：不只是清界面，磁盘上的 .md 也一起删。这是上次"清了还在"的根因 */
function clearQueue(payload) {
  const scope = (payload && payload.scope) === "root" ? "root" : "all";
  const roots = scope === "root" ? [resolveRoot(payload)] : knownRoots();
  let removed = 0;

  for (const root of roots) {
    if (!insideSandbox(root)) continue;
    const q = loadQueue(root);
    for (const it of q.items) {
      const abs = it.abs || path.join(root, it.file);
      if (!abs || !insideSandbox(abs)) continue;
      if (fs.existsSync(abs)) {
        try { fs.rmSync(abs, { force: true }); removed++; } catch { /* 删不掉就算了，索引照样清 */ }
      }
    }
    writeJson(queueFile(root), { items: [] });
  }

  log("清空队列（" + scope + "）· 删掉 " + removed + " 个文件 · 扫了 " + roots.length + " 个项目");
  return { removed, roots: roots.length, scope };
}

/* 在 Finder 里定位：网页自己拉不起 Finder，只能让本地桥代劳 */
function revealPath(target, mode) {
  const real = realish(target) || target;
  if (!insideSandbox(real)) throw new OutsideSandbox(real);
  if (process.platform !== "darwin") throw new Error("只有 macOS 支持 Finder 定位");

  /* 还没生成文件时退到最近的已存在目录，别让按钮点了没反应 */
  let p = real;
  while (!fs.existsSync(p) && path.dirname(p) !== p) p = path.dirname(p);
  const args = mode === "open" ? [p] : ["-R", p];

  /* SPOT_NO_OPEN=1 只算路径不调 open —— 回归测试用，免得每跑一次弹一堆 Finder 窗口 */
  if (process.env.SPOT_NO_OPEN !== "1") {
    try {
      const child = spawn("open", args, { detached: true, stdio: "ignore" });
      child.unref();
    } catch (e) {
      throw new Error("调起 Finder 失败：" + e.message);
    }
  }
  return p;
}

function revealItem(payload) {
  if (payload && payload.id) {
    const it = findItem(payload.id);
    if (!it) throw new Error("找不到任务：" + payload.id);
    return revealPath(it.abs || path.join(it.root, it.file), "select");
  }
  const root = resolveRoot(payload);
  const dir = path.join(root, ".spot", "prompts");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return revealPath(dir, "open");
}

/* ---------------- MCP ---------------- */

const MARK = { pending: "○", done: "●", submitted: "◐" };

function fmtList(items) {
  if (!items.length) return "队列是空的。让用户在页面里框选元素、写一段「请求」再提交。";
  const counts = new Map();
  for (const it of items) counts.set(it.root, (counts.get(it.root) || 0) + 1);
  const spread = [...counts.entries()].map(([r, n]) => path.basename(r) + " ×" + n).join(" · ");

  const lines = ["共 " + items.length + " 条（最新在前）：", "项目：" + spread, ""];
  items.forEach((it, i) => {
    lines.push(
      (i + 1) + ". " + (MARK[it.status] || "○") + " " + it.id + "  [" + it.status + "]  " + (it.title || "(无标题)")
    );
    lines.push("   项目：" + path.basename(it.root));
    lines.push("   请求：" + (it.request || "").slice(0, 100).replace(/\s+/g, " "));
    lines.push("   文件：" + (it.abs || path.join(it.root, it.file)));
  });
  lines.push("", "用 spot_read_prompt 拿全文；改完代码后用 spot_mark_done 标记完成。");
  return lines.join("\n");
}

const TOOLS = [
  {
    name: "spot_list_prompts",
    description:
      "列出用户在网页上通过 Spot Agent 提交的修复任务（含选区上下文与「## 请求」）。" +
      "用户说「看一下 spot 队列 / 处理一下页面提交的任务」时先调这个。",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "submitted", "done"], description: "按状态过滤，默认全部" },
        limit: { type: "number", description: "最多返回几条，默认 20" }
      }
    }
  },
  {
    name: "spot_read_prompt",
    description: "读取一条任务的完整 Markdown（页面信息 + 每个选中元素的选择器/盒模型/字体/文本 + 用户请求）。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "任务 id 或文件路径，来自 spot_list_prompts" }
      },
      required: ["id"]
    }
  },
  {
    name: "spot_mark_done",
    description: "把任务标记为完成（或 blocked），写回队列，避免下次重复处理。代码改完后调用。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "任务 id" },
        status: { type: "string", enum: ["done", "blocked"], description: "默认 done" },
        note: { type: "string", description: "一句话说明改了什么" }
      },
      required: ["id"]
    }
  },
  {
    name: "spot_status",
    description: "桥的运行状态：监听地址、已知项目根、各状态任务数。",
    inputSchema: { type: "object", properties: {} }
  }
];

const tools = {
  spot_list_prompts(args) {
    return fmtList(listPrompts(args || {}));
  },
  spot_read_prompt(args) {
    if (!args || !args.id) throw new Error("缺少 id");
    const r = readPrompt(args.id);
    return r.text + "\n\n---\n任务 id：" + r.item.id + " · 状态：" + r.item.status + " · 项目根：" + r.item.root;
  },
  spot_mark_done(args) {
    if (!args || !args.id) throw new Error("缺少 id");
    const it = markDone(args.id, args.note, args.status);
    return "已标记 " + it.id + " → " + (args.status || "done") + (args.note ? "（" + args.note + "）" : "");
  },
  spot_status() {
    const items = allItems();
    const by = { pending: 0, submitted: 0, done: 0 };
    items.forEach((it) => { if (by[it.status] != null) by[it.status]++; });
    return [
      "版本：" + VERSION,
      "HTTP：" + (httpUp ? "http://" + HOST + ":" + PORT : "未启动"),
      "端口：" + PORT,
      "沙箱：" + SANDBOX + "（项目根必须在这里面，否则拒绝写入）",
      "已知项目根：",
      ...(knownRoots().length ? knownRoots().map((r) => "  - " + r) : ["  （还没有，先在页面上提交一次）"]),
      "任务：pending " + by.pending + " / submitted " + by.submitted + " / done " + by.done
    ].join("\n");
  }
};

function sendStdout(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function ok(id, result) {
  sendStdout({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  sendStdout({ jsonrpc: "2.0", id, error: { code, message } });
}

function handleMcp(msg) {
  const id = msg.id;
  const method = msg.method;

  if (method === "initialize") {
    const p = (msg.params && msg.params.protocolVersion) || "2024-11-05";
    ok(id, {
      protocolVersion: p,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "spot-agent", version: VERSION }
    });
    return;
  }
  if (method === "notifications/initialized" || method === "initialized") return;
  if (method === "ping") { ok(id, {}); return; }
  if (method === "tools/list") { ok(id, { tools: TOOLS }); return; }

  if (method === "tools/call") {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const fn = tools[name];
    if (!fn) { fail(id, -32602, "未知工具：" + name); return; }
    try {
      ok(id, { content: [{ type: "text", text: String(fn(args)) }] });
    } catch (e) {
      ok(id, { content: [{ type: "text", text: "错误：" + e.message }], isError: true });
    }
    return;
  }

  if (id != null) fail(id, -32601, "未实现的方法：" + method);
}

/* ---------------- HTTP ---------------- */

let httpUp = false;

function allowedOrigin(origin) {
  if (!origin) return true;                                        // curl / 扩展 service worker
  if (origin === "null") return true;                              // file:// 页面
  if (origin.startsWith("chrome-extension://")) return true;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true;
  return false;
}

function reply(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Spot-Client");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.method !== "POST") { reply(res, 405, { ok: false, error: "method-not-allowed" }); return; }
  if (!allowedOrigin(origin)) {
    log("拒绝来源 " + origin);
    reply(res, 403, { ok: false, error: "origin-not-allowed" });
    return;
  }

  const url = new URL(req.url, "http://" + HOST);
  let payload = {};
  try {
    const raw = await readBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    reply(res, 400, { ok: false, error: "bad-json", detail: String(e.message) });
    return;
  }

  try {
    if (url.pathname === "/ping") {
      /* 探活永远 200：桥活着就是活着。页面越界时额外给 blocked，
         让扩展能说清"桥在线、但这个页面不在允许范围" */
      const body = { ok: true, version: VERSION, port: PORT, sandbox: SANDBOX };
      try {
        body.root = resolveRoot(payload);
      } catch (e) {
        if (e.code !== "outside-sandbox") throw e;
        body.root = "";
        body.blocked = true;
        body.outside = e.path;
      }
      reply(res, 200, body);
      return;
    }
    if (url.pathname === "/submit") {
      const r = submit(payload);
      reply(res, 200, { ok: true, file: r.file, root: r.root, id: r.id });
      return;
    }
    if (url.pathname === "/queue") {
      reply(res, 200, { ok: true, items: listPrompts(payload) });
      return;
    }
    if (url.pathname === "/update") {
      const r = updateItem(payload);
      reply(res, 200, { ok: true, id: r.id, file: r.file, root: r.root });
      return;
    }
    if (url.pathname === "/delete") {
      const r = deleteItem(payload.id);
      reply(res, 200, { ok: true, id: r.id, file: r.file, root: r.root });
      return;
    }
    if (url.pathname === "/clear") {
      const r = clearQueue(payload);
      reply(res, 200, { ok: true, removed: r.removed, roots: r.roots, scope: r.scope });
      return;
    }
    if (url.pathname === "/reveal") {
      reply(res, 200, { ok: true, path: revealItem(payload) });
      return;
    }
    if (url.pathname === "/done") {
      markDone(payload.id, payload.note, payload.status || "done");
      reply(res, 200, { ok: true });
      return;
    }
    reply(res, 404, { ok: false, error: "not-found" });
  } catch (e) {
    if (e.code === "outside-sandbox") {
      log("拒绝写入 " + e.path + "（沙箱 " + SANDBOX + "）");
      reply(res, 403, {
        ok: false,
        error: "outside-sandbox",
        detail: e.message,
        sandbox: SANDBOX,
        outside: e.path
      });
      return;
    }
    log("处理 " + url.pathname + " 失败：" + e.message);
    reply(res, 500, { ok: false, error: "failed", detail: e.message });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    log("端口 " + PORT + " 已被占用，只提供 MCP（另一实例大概已经在跑）");
  } else {
    log("HTTP 启动失败：" + e.message);
  }
});

pruneRoots();

/* 默认沙箱是作者机器的目录约定，换一台机器常常并不存在。
   不拦启动，但要说清楚：没有这个目录，任何写入都会被判越界。 */
if (!fs.existsSync(SANDBOX)) {
  log("沙箱目录不存在：" + SANDBOX + "（设置 SPOT_SANDBOX 指向你的项目目录，否则写入会被拒绝）");
}

server.listen(PORT, HOST, () => {
  httpUp = true;
  log("HTTP 就绪 http://" + HOST + ":" + PORT + "  任务落到 <项目>/.spot/prompts/");
  log("沙箱 " + SANDBOX + "（越界的项目一律拒绝写入）");
});

/* ---------------- 启动 ---------------- */

if (!HTTP_ONLY) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const s = line.trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); } catch { log("MCP 收到非 JSON 行，忽略"); return; }
    try { handleMcp(msg); } catch (e) { log("MCP 处理失败：" + e.message); }
  });
  rl.on("close", () => {
    log("MCP 通道关闭，退出");
    setTimeout(() => process.exit(0), 60);
  });
  log("MCP 就绪（stdio）· 工具：" + TOOLS.map((t) => t.name).join(", "));
}
