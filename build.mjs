/* 零依赖打包：把按序排列的源文件拼成单文件，供书签脚本 / 控制台注入使用。
   用法：node build.mjs                     → dist/spot-agent.inline.js
        node build.mjs --bookmarklet       → 额外输出 dist/bookmarklet.txt
*/
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

const FILES = [
  "src/core/ns.js",
  "src/core/store.js",
  "src/core/state.js",
  "src/ui/styles.js",
  "src/core/overlay.js",
  "src/core/scan.js",
  "src/core/render.js",
  "src/core/hit.js",
  "src/core/snapshot.js",
  "src/core/queue.js",
  "src/core/bridge.js",
  "src/core/keys.js",
  "src/core/input.js",
  "src/ui/panel.js",
  "src/ui/queueview.js",
  "src/ui/composer.js",
  "src/content.js"
];

const parts = FILES.map((f) => {
  const code = readFileSync(join(here, f), "utf8");
  return `/* ---- ${f} ---- */\n${code.trim()}\n`;
});

const banner =
  "/* Spot Agent " + manifest.version + " · 单文件构建产物，请勿手改（改 src/ 后运行 node build.mjs） */\n" +
  "(function(){\n" +
  "if (document.getElementById('__spot_host')) { console.warn('[Spot] 已注入'); return; }\n";

const footer = "\n})();\n";

const out = banner + parts.join("\n") + footer;

mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist/spot-agent.inline.js"), out, "utf8");
console.log(`dist/spot-agent.inline.js  ${(out.length / 1024).toFixed(1)} KB`);

if (process.argv.includes("--bookmarklet")) {
  const url = "javascript:" + encodeURIComponent(
    "var s=document.createElement('script');s.src='file://" +
    join(here, "dist/spot-agent.inline.js").replace(/'/g, "\\'") +
    "';document.documentElement.appendChild(s);void 0;"
  );
  writeFileSync(join(here, "dist/bookmarklet.txt"), url, "utf8");
  console.log(`dist/bookmarklet.txt  ${url.length} chars`);
}
