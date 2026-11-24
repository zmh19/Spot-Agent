/* 一次性工具：把已有 md 里那行 UTC ISO 时间改成本地墙上时间
   规则与 src/core/snapshot.js 的 stamp() 完全一致（YYYY-MM-DD HH:mm:ss）。
   用法：node dev/_stampfix.mjs <prompts 目录> */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("用法：node dev/_stampfix.mjs <prompts 目录>");
  process.exit(1);
}

const P = (n) => String(n).padStart(2, "0");
let n = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".md")) continue;
  const p = path.join(dir, f);
  const src = fs.readFileSync(p, "utf8");
  const m = src.match(/(^- 提交时间：)([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]{8,}Z)$/m);
  if (!m) continue;
  const d = new Date(m[2]);
  if (isNaN(d.getTime())) { console.log(f + " 时间解析不了，跳过"); continue; }
  const t = `${d.getFullYear()}-${P(d.getMonth() + 1)}-${P(d.getDate())} ` +
    `${P(d.getHours())}:${P(d.getMinutes())}:${P(d.getSeconds())}`;
  fs.writeFileSync(p, src.replace(m[0], m[1] + t));
  console.log(f + "  →  " + t);
  n++;
}
console.log("改完 " + n + " 个文件");
