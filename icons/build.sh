#!/usr/bin/env bash
# 重新生成扩展图标：几何以 icon.svg / icon-flat.svg 为准，不另行手绘。
# 依赖 rsvg-convert（brew install librsvg）
set -e
cd "$(dirname "$0")"
for s in 128 96 48; do rsvg-convert -w "$s" -h "$s" icon.svg -o "icon-$s.png"; done
for s in 32 16;       do rsvg-convert -w "$s" -h "$s" icon-flat.svg -o "icon-$s.png"; done
echo "icons: $(ls icon-*.png | tr '\n' ' ')"
