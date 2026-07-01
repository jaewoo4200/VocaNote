#!/bin/bash
# 앱 아이콘 생성: make_icon.swift로 1024 PNG 렌더 → sips로 각 크기 → iconutil로 .icns
set -euo pipefail
cd "$(dirname "$0")"

echo "▸ rendering 1024 icon ..."
swiftc -O make_icon.swift -o make_icon
./make_icon icon_1024.png

ICONSET="AppIcon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
gen() { sips -z "$1" "$1" icon_1024.png --out "$ICONSET/$2" >/dev/null; }
gen 16   icon_16x16.png
gen 32   icon_16x16@2x.png
gen 32   icon_32x32.png
gen 64   icon_32x32@2x.png
gen 128  icon_128x128.png
gen 256  icon_128x128@2x.png
gen 256  icon_256x256.png
gen 512  icon_256x256@2x.png
gen 512  icon_512x512.png
cp icon_1024.png "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o ../AppIcon.icns
rm -rf "$ICONSET" make_icon icon_1024.png
echo "✅ ../AppIcon.icns"
