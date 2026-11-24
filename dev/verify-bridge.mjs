#!/usr/bin/env node
/* Spot Agent · 桥的自动化回归
 * 跑法：node dev/verify-bridge.mjs
 * 覆盖：HTTP 提交 → 文件落盘 → 队列索引 → MCP 握手 → 四个工具
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BRIDGE = path.join(ROOT, "bridge", "bridge.mjs");
const ROOTS_FILE = path.join(ROOT, "bridge", "roots.json");
const PORT = 8799;

const out = [];
let fails = 0;

function check(name, ok, extra) {
  if (!ok) fails++;
  out.push({ name, ok: !!ok, extra: extra == null ? "" : String(extra) });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(p, body, port) {
  const r = await fetch(`http://127.0.0.1:${port || PORT}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Spot-Client": "spot-agent" },
    body: JSON.stringify(body || {})
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "spot-bridge-"));
  /* macOS 的 /var 是 /private/var 的符号链接，桥返回的是 realpath，比较前先对齐 */
  const realWork = fs.realpathSync(work);
  const backup = fs.existsSync(ROOTS_FILE) ? fs.readFileSync(ROOTS_FILE, "utf8") : null;

  /* ---- 第一段：HTTP ---- */
  const httpProc = spawn(process.execPath, [BRIDGE, "--http-only", "--root=" + work], {
    env: { ...process.env, SPOT_PORT: String(PORT), SPOT_SANDBOX: work },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let err = "";
  httpProc.stderr.on("data", (d) => { err += d.toString(); });

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await wait(100);
    try { up = (await post("/ping", {})).data?.ok === true; } catch { /* 还没起 */ }
  }
  check("HTTP 就绪", up, err.split("\n")[0]);

  const item = {
    id: "sa-20260101-000000-test",
    url: "file://" + path.join(work, "index.html"),
    title: "测试页面 · Spot",
    request: "把左侧卡片间距从 12 改成 16",
    createdAt: "2026-01-01T00:00:00.000Z",
    md: "# 任务\n\n## 请求\n把左侧卡片间距从 12 改成 16\n"
  };
  const sent = await post("/submit", item);
  check("提交返回 ok", sent.data?.ok === true, JSON.stringify(sent.data));
  check("返回落在项目根内", String(sent.data?.file || "").startsWith(realWork), sent.data?.file);

  check("Prompt 文件已写盘", fs.existsSync(sent.data?.file || ""), sent.data?.file);
  const mdText = fs.existsSync(sent.data?.file || "") ? fs.readFileSync(sent.data.file, "utf8") : "";
  check("文件含请求原文", mdText.includes("把左侧卡片间距从 12 改成 16"));
  check("文件名带任务单号", path.basename(sent.data?.file || "").startsWith("20260101-000000-test"));

  const qf = path.join(work, ".spot", "queue.json");
  const q = fs.existsSync(qf) ? JSON.parse(fs.readFileSync(qf, "utf8")) : { items: [] };
  check("队列索引已建", q.items.length === 1 && q.items[0].status === "pending", JSON.stringify(q.items[0] || null));

  const list = await post("/queue", {});
  check("HTTP 列出队列", list.data?.items?.length === 1, list.data?.items?.length);

  const empty = await post("/submit", { id: "x", md: "   " });
  check("空内容被拒", empty.status === 500, empty.status);

  httpProc.kill("SIGTERM");
  await wait(300);

  /* ---- 第二段：MCP（stdio） ---- */
  const mcpProc = spawn(process.execPath, [BRIDGE, "--root=" + work], {
    env: { ...process.env, SPOT_PORT: String(PORT), SPOT_SANDBOX: work },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const replies = new Map();
  let buf = "";
  mcpProc.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        replies.set(msg.id, msg);
      } catch { /* 非 JSON 行 */ }
    }
  });
  let mcpErr = "";
  mcpProc.stderr.on("data", (d) => { mcpErr += d.toString(); });

  const send = (obj) => mcpProc.stdin.write(JSON.stringify(obj) + "\n");
  const call = async (id, method, params) => {
    send({ jsonrpc: "2.0", id, method, params });
    for (let i = 0; i < 40; i++) {
      if (replies.has(id)) return replies.get(id);
      await wait(50);
    }
    return null;
  };

  const init = await call(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify", version: "1" } });
  check("MCP initialize", init?.result?.serverInfo?.name === "spot-agent", JSON.stringify(init?.result?.serverInfo));
  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const tl = await call(2, "tools/list", {});
  const names = (tl?.result?.tools || []).map((t) => t.name);
  check("tools/list 四个工具", names.length === 4, names.join(","));
  check("工具含 spot_read_prompt", names.includes("spot_read_prompt"));

  const lst = await call(3, "tools/call", { name: "spot_list_prompts", arguments: {} });
  const lstText = lst?.result?.content?.[0]?.text || "";
  check("list 能看到任务", lstText.includes("sa-20260101-000000-test"), lstText.slice(0, 80));
  check("list 带请求摘要", lstText.includes("间距"));
  check("list 标出所属项目", lstText.includes("项目：" + path.basename(realWork)), lstText.split("\n")[1]);

  const rd = await call(4, "tools/call", { name: "spot_read_prompt", arguments: { id: "sa-20260101-000000-test" } });
  const rdText = rd?.result?.content?.[0]?.text || "";
  check("read 返回全文", rdText.includes("把左侧卡片间距从 12 改成 16"), rdText.length);
  check("read 附带项目根", rdText.includes(realWork));

  const done = await call(5, "tools/call", { name: "spot_mark_done", arguments: { id: "sa-20260101-000000-test", note: "已改 gap" } });
  check("mark_done 成功", (done?.result?.content?.[0]?.text || "").includes("done"), JSON.stringify(done?.result));
  const q2 = JSON.parse(fs.readFileSync(qf, "utf8"));
  check("状态回写队列", q2.items[0].status === "done" && q2.items[0].note === "已改 gap", JSON.stringify(q2.items[0]));

  const st = await call(6, "tools/call", { name: "spot_status", arguments: {} });
  check("status 报端口", (st?.result?.content?.[0]?.text || "").includes("8799"));

  const bad = await call(7, "tools/call", { name: "nope", arguments: {} });
  check("未知工具报错", !!bad?.error, JSON.stringify(bad?.error));

  mcpProc.kill("SIGTERM");
  await wait(200);

  check("stderr 无异常堆栈", !/Unhandled|stack/i.test(mcpErr) || /EADDRINUSE/.test(mcpErr), mcpErr.slice(0, 120));

  /* ---- 第三段：项目根定位。外层的 .git 不许抢走内层项目的任务 ---- */
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), "spot-root-"));
  const proj = path.join(outer, "SomeProject");
  const deep = path.join(proj, "dashboard", "sub");
  fs.mkdirSync(deep, { recursive: true });
  fs.mkdirSync(path.join(outer, ".git"));          /* 共同父仓，必须被忽略 */
  fs.mkdirSync(path.join(proj, ".qoder"));         /* 真正的项目边界 */
  fs.writeFileSync(path.join(deep, "index.html"), "<!doctype html><title>page</title>");
  const realProj = fs.realpathSync(proj);

  const env2 = { ...process.env, SPOT_PORT: String(PORT + 1), SPOT_SANDBOX: outer };
  delete env2.SPOT_ROOT;                            /* 不指定就把主动权交给页面 */
  const rootProc = spawn(process.execPath, [BRIDGE, "--http-only"], {
    cwd: outer, env: env2, stdio: ["ignore", "pipe", "pipe"]
  });
  const rootErr = [];
  rootProc.stderr.on("data", (d) => rootErr.push(d.toString()));

  let up2 = false;
  for (let i = 0; i < 40 && !up2; i++) {
    await wait(100);
    try { up2 = (await post("/ping", {}, PORT + 1)).data?.ok === true; } catch { /* 还没起 */ }
  }
  check("定位段 HTTP 就绪", up2, rootErr.join("").split("\n")[0]);

  const sent2 = await post("/submit", {
    id: "sa-root-test",
    url: "file://" + path.join(deep, "index.html"),
    title: "根定位",
    request: "测试项目根",
    md: "# 测试项目根\n"
  }, PORT + 1);

  const gotRoot = sent2.data?.root ? fs.realpathSync(sent2.data.root) : "";
  check("按页面所在项目定位根", gotRoot === realProj,
    gotRoot === realProj ? gotRoot : gotRoot + " ≠ " + realProj);
  check("落进该项目自己的 .spot", String(sent2.data?.file || "").startsWith(realProj) &&
    fs.existsSync(sent2.data?.file || ""), sent2.data?.file);
  check("外层 .git 未被采用", gotRoot !== fs.realpathSync(outer), "outer=" + fs.realpathSync(outer));

  /* 两个项目的任务要并存，各自带自己的根。
     注意：沙箱生效后跨沙箱的根会被剔掉，所以第二个项目要放在同一个沙箱里 */
  const proj2 = path.join(outer, "AnotherProject");
  fs.mkdirSync(path.join(proj2, "docs"), { recursive: true });
  fs.mkdirSync(path.join(proj2, ".qoder"));
  fs.writeFileSync(path.join(proj2, "docs", "index.html"), "<!doctype html>");
  const sent3 = await post("/submit", {
    id: "sa-root-test-2",
    url: "file://" + path.join(proj2, "docs", "index.html"),
    title: "根定位二",
    request: "第二个项目",
    md: "# 第二个项目\n"
  }, PORT + 1);
  check("第二个项目各自定位", sent3.data?.root === fs.realpathSync(proj2), sent3.data?.root);

  const q3 = await post("/queue", {}, PORT + 1);
  const roots3 = new Set((q3.data?.items || []).map((x) => x.root));
  check("多条任务分属不同项目", roots3.size >= 2,
    [...roots3].map((r) => path.basename(r)).join(" · "));

  rootProc.kill("SIGTERM");
  await wait(200);
  fs.rmSync(outer, { recursive: true, force: true });

  /* ---- 第四段：沙箱。AI_Projects 之外一律不写，软链接和手改 json 也不行 ---- */
  const jail = fs.mkdtempSync(path.join(os.tmpdir(), "spot-jail-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "spot-out-"));
  fs.writeFileSync(path.join(jail, "index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(outside, "index.html"), "<!doctype html>");
  fs.symlinkSync(outside, path.join(jail, "escape"));       /* 软链接把根拽出沙箱 */

  const jailEnv = { ...process.env, SPOT_PORT: String(PORT + 2), SPOT_SANDBOX: jail };
  delete jailEnv.SPOT_ROOT;
  /* 双模起一个：HTTP 和 MCP 同时验，省一个进程 */
  const jailProc = spawn(process.execPath, [BRIDGE], {
    cwd: jail, env: jailEnv, stdio: ["pipe", "pipe", "pipe"]
  });
  const jrep = new Map();
  let jbuf = "";
  jailProc.stdout.on("data", (d) => {
    jbuf += d.toString();
    let i;
    while ((i = jbuf.indexOf("\n")) >= 0) {
      const line = jbuf.slice(0, i).trim();
      jbuf = jbuf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); jrep.set(m.id, m); } catch { /* 非 JSON 行 */ }
    }
  });
  let jailErr = "";
  jailProc.stderr.on("data", (d) => { jailErr += d.toString(); });
  const jcall = async (id, method, params) => {
    jailProc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    for (let i = 0; i < 40; i++) {
      if (jrep.has(id)) return jrep.get(id);
      await wait(50);
    }
    return null;
  };
  jailProc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } }) + "\n");
  jailProc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  let up4 = false;
  for (let i = 0; i < 40 && !up4; i++) {
    await wait(100);
    try { up4 = (await post("/ping", {}, PORT + 2)).data?.ok === true; } catch { /* 还没起 */ }
  }
  check("沙箱段 HTTP 就绪", up4, jailErr.split("\n")[0]);
  check("启动声明沙箱", jailErr.includes("沙箱 " + fs.realpathSync(jail)), jailErr.trim().split("\n").pop());

  const inBox = await post("/submit", {
    id: "sa-in-box", url: "file://" + path.join(jail, "index.html"), title: "箱内", md: "# 箱内\n"
  }, PORT + 2);
  check("沙箱内正常写入", inBox.data?.ok === true &&
    String(inBox.data?.file || "").startsWith(fs.realpathSync(jail)), inBox.data?.file);

  const outPage = await post("/submit", {
    id: "sa-out-page", url: "file://" + path.join(outside, "index.html"), title: "箱外", md: "# 箱外\n"
  }, PORT + 2);
  check("沙箱外页面被拒", outPage.status === 403 && outPage.data?.error === "outside-sandbox",
    outPage.status + " " + outPage.data?.error);
  check("沙箱外未落盘", !fs.existsSync(path.join(outside, ".spot")), path.join(outside, ".spot"));

  const viaLink = await post("/submit", {
    id: "sa-via-link", url: "file://" + path.join(jail, "escape", "index.html"), title: "软链", md: "# 软链\n"
  }, PORT + 2);
  check("软链接逃逸被拒", viaLink.status === 403 && viaLink.data?.error === "outside-sandbox",
    viaLink.status + " " + viaLink.data?.error);

  const pingOut = await post("/ping", { url: "file://" + path.join(outside, "index.html") }, PORT + 2);
  check("ping 标出 blocked", pingOut.data?.ok === true && pingOut.data?.blocked === true,
    JSON.stringify(pingOut.data));

  /* 手改 queue.json 也逃不出去：abs 指到沙箱外，read 必须拒 */
  fs.writeFileSync(path.join(jail, ".spot", "queue.json"), JSON.stringify({
    items: [{
      id: "sa-evil", title: "越界", root: fs.realpathSync(jail), file: "../evil.md",
      abs: path.join(outside, "evil.md"), status: "pending", createdAt: "2026-01-01T00:00:00.000Z"
    }]
  }, null, 2) + "\n");
  const evil = await jcall(2, "tools/call", { name: "spot_read_prompt", arguments: { id: "sa-evil" } });
  check("手改 queue.json 越界读被拒", evil?.result?.isError === true,
    (evil?.result?.content?.[0]?.text || "").slice(0, 46));

  jailProc.kill("SIGTERM");
  await wait(200);
  fs.rmSync(jail, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });

  /* ---- 第五段：维护接口。改 / 删 / 清 / 定位，都要真动磁盘 ---- */
  const mtProc = spawn(process.execPath, [BRIDGE, "--http-only", "--root=" + work], {
    env: { ...process.env, SPOT_PORT: String(PORT + 3), SPOT_SANDBOX: work, SPOT_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let mtErr = "";
  mtProc.stderr.on("data", (d) => { mtErr += d.toString(); });

  let up5 = false;
  for (let i = 0; i < 40 && !up5; i++) {
    await wait(100);
    try { up5 = (await post("/ping", {}, PORT + 3)).data?.ok === true; } catch { /* 还没起 */ }
  }
  check("维护段 HTTP 就绪", up5, mtErr.split("\n")[0]);

  const seed = await post("/submit", {
    id: "sa-maint", url: "file://" + path.join(work, "index.html"), title: "维护", md: "# 维护\n"
  }, PORT + 3);
  check("维护段写入成功", seed.data?.ok === true && fs.existsSync(seed.data.file), seed.data?.file);

  const upd = await post("/update", {
    id: "sa-maint", request: "把间距改成 20", md: "# 维护\n\n## 请求\n把间距改成 20\n"
  }, PORT + 3);
  check("update 返回 ok", upd.data?.ok === true, JSON.stringify(upd.data));
  check("update 重写文件", fs.readFileSync(seed.data.file, "utf8").includes("把间距改成 20"));
  const qU = JSON.parse(fs.readFileSync(qf, "utf8"));
  const rowU = qU.items.find((x) => x.id === "sa-maint") || {};
  check("update 同步索引", rowU.request === "把间距改成 20" && !!rowU.updatedAt,
    rowU.request + " / " + rowU.updatedAt);

  const qBody = await post("/queue", { withBody: true }, PORT + 3);
  const withMd = (qBody.data?.items || []).find((x) => x.id === "sa-maint") || {};
  check("queue 带正文（面板要就地编辑）", String(withMd.md || "").includes("把间距改成 20"),
    String(withMd.md || "").length + " 字符");

  const rev = await post("/reveal", { id: "sa-maint" }, PORT + 3);
  check("reveal 给出文件路径", rev.data?.path === fs.realpathSync(seed.data.file), rev.data?.path);
  const revDir = await post("/reveal", {}, PORT + 3);
  check("reveal 无 id 落到 prompts 目录",
    revDir.data?.path === fs.realpathSync(path.join(work, ".spot", "prompts")), revDir.data?.path);

  const doomed = await post("/submit", {
    id: "sa-doomed", url: "file://" + path.join(work, "index.html"), title: "待删", md: "# 待删\n"
  }, PORT + 3);
  const delOne = await post("/delete", { id: "sa-doomed" }, PORT + 3);
  check("delete 返回 ok", delOne.data?.ok === true, JSON.stringify(delOne.data));
  check("delete 删掉磁盘文件", !fs.existsSync(doomed.data.file), doomed.data.file);
  check("delete 摘掉索引",
    !JSON.parse(fs.readFileSync(qf, "utf8")).items.some((x) => x.id === "sa-doomed"));

  const last = await post("/submit", {
    id: "sa-sweep", url: "file://" + path.join(work, "index.html"), title: "待清", md: "# 待清\n"
  }, PORT + 3);
  /* 一条一条数清楚：这一段之前的第一段任务也躺在同一个队列里 */
  const beforeClear = JSON.parse(fs.readFileSync(qf, "utf8")).items.length;
  const clr = await post("/clear", { scope: "root" }, PORT + 3);
  check("clear 报出删除条数", clr.data?.ok === true && clr.data?.removed === beforeClear,
    clr.data?.removed + " / 队列里 " + beforeClear + " 条");
  check("clear 删光磁盘文件", !fs.existsSync(last.data.file) && !fs.existsSync(seed.data.file));
  check("clear 清空索引", JSON.parse(fs.readFileSync(qf, "utf8")).items.length === 0);

  const miss = await post("/delete", { id: "sa-nope" }, PORT + 3);
  check("删不存在的条目要报错", miss.data?.ok === false, JSON.stringify(miss.data));

  mtProc.kill("SIGTERM");
  await wait(200);

  /* 清理：临时目录 + roots.json 还原 */
  fs.rmSync(work, { recursive: true, force: true });
  if (backup === null) fs.rmSync(ROOTS_FILE, { force: true });
  else fs.writeFileSync(ROOTS_FILE, backup, "utf8");

  const pass = fails === 0;
  console.log("BRIDGETEST " + (pass ? "ALL_PASS" : "FAIL " + fails));
  for (const r of out) console.log("  " + r.name + "=" + (r.ok ? "PASS" : "FAIL") + "(" + r.extra + ")");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("BRIDGETEST CRASH", e);
  process.exit(2);
});
