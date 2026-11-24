#!/bin/bash
# Spot Agent · 无头回归：把 dashboard 复制到临时目录，注入单文件构建产物与 harness，
# 用 headless Chrome 跑一遍真实布局下的自检 + 点击/框选，结果从 document.title 读回。
# 不截图、不打开用户的浏览器窗口、不改动被验证的项目。
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TARGET="${1:-}"
WORK="${TMPDIR:-/tmp}/spot-verify"
PROFILE="${TMPDIR:-/tmp}/spot-verify-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ -z "$TARGET" ]; then
  echo "用法：bash dev/verify.sh <包含 index.html 的页面目录>"
  echo "这是针对 dashboard 结构写的界面回归，需要显式传入目标页面。"
  exit 1
fi
[ -d "$TARGET" ] || { echo "找不到目标目录：$TARGET"; exit 1; }
[ -x "$CHROME" ] || { echo "找不到 Chrome"; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"

cd "$ROOT" && node build.mjs >/dev/null

# 契约检查：bridge.js 里用到的每个接口，都必须在 background.js 的 ALLOW 白名单里，
# 否则线上表现是"路径不被允许"，而两边的自测都还是绿的。
node -e '
const fs = require("fs"), path = require("path");
const root = process.argv[1];
const used = [...fs.readFileSync(path.join(root, "src/core/bridge.js"), "utf8")
  .matchAll(/post\("(\/[a-z]+)"/g)].map((m) => m[1]);
const allow = (fs.readFileSync(path.join(root, "src/background.js"), "utf8")
  .match(/ALLOW = \[([^\]]*)\]/) || [, ""])[1];
const missing = [...new Set(used)].filter((p) => allow.indexOf("\"" + p + "\"") < 0);
if (missing.length) {
  console.log("CONTRACT FAIL 后台没放行：" + missing.join(", "));
  process.exit(2);
}
console.log("CONTRACT OK 放行 " + [...new Set(used)].join(", "));
' "$ROOT"

rm -rf "$WORK" && mkdir -p "$WORK"
rm -rf "$PROFILE"
cp -R "$TARGET/." "$WORK/"
cp "$ROOT/dist/spot-agent.inline.js" "$WORK/"
cp "$HERE/harness.js" "$WORK/__harness.js"

node -e '
const fs = require("fs");
const f = process.argv[1] + "/index.html";
const html = fs.readFileSync(f, "utf8");
const inject = "<script src=\"spot-agent.inline.js\"></script><script src=\"__harness.js\"></script>";
fs.writeFileSync(process.argv[1] + "/__test.html", html.replace("</body>", inject + "\n</body>"));
' "$WORK"

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir="$PROFILE" --window-size=1440,900 --virtual-time-budget=4000 \
  --dump-dom "file://$WORK/__test.html" 2>/dev/null \
  | tr -d '\n' | grep -o 'SPOTTEST[^<]*' | head -1 | sed 's/ ;; /\n  /g'
