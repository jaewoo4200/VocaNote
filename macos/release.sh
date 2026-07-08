#!/bin/bash
# VocaNote 배포용 유니버설(.app + .zip) 빌드 — Apple Silicon + Intel 모두 지원.
set -euo pipefail
cd "$(dirname "$0")"

APP="VocaNote.app"
VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" Info.plist 2>/dev/null || echo "1.0.0")
echo "▸ VocaNote $VER 유니버설 릴리스 빌드 ..."

pkill -x VocaNote 2>/dev/null || true

# Supabase 설정 주입 (build.sh 와 동일 — .env.local 에서)
ENVFILE=""
for f in .env.local ../.env.local ../.env; do [ -f "$f" ] && ENVFILE="$f" && break; done
SB_URL=""; SB_KEY=""
if [ -n "$ENVFILE" ]; then
  SB_URL=$(grep -E '^VITE_SUPABASE_URL=' "$ENVFILE" | head -1 | sed -E 's/^VITE_SUPABASE_URL=//' | tr -d '"'"'"'' | tr -d "'" | tr -d ' \r')
  SB_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' "$ENVFILE" | head -1 | sed -E 's/^VITE_SUPABASE_ANON_KEY=//' | tr -d '"'"'"'' | tr -d "'" | tr -d ' \r')
fi
cat > Sources/SupabaseConfig.swift <<EOF
// AUTO-GENERATED — 커밋 금지
enum SupabaseConfig {
    static let url = "$SB_URL"
    static let anonKey = "$SB_KEY"
    static var isConfigured: Bool { !url.isEmpty && !anonKey.isEmpty }
}
EOF

rm -rf "$APP" build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build
cp Info.plist "$APP/Contents/Info.plist"
cp Resources/wordlist.txt Resources/abbreviations.json Resources/ktword.json "$APP/Contents/Resources/"
[ -f AppIcon.icns ] || (cd icon && ./make-icons.sh)
cp AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

# 릴리스 빌드 번호: 커밋 수 기반 단조 증가 (LaunchServices 가 stale 등록을 안 잡게)
BUILD_NUM=$(git rev-list --count HEAD 2>/dev/null || date +%Y%m%d%H%M)
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUM" "$APP/Contents/Info.plist" 2>/dev/null || true
echo "  빌드 번호: $BUILD_NUM"

FW="-framework Cocoa -framework SwiftUI -framework Carbon -framework ServiceManagement -framework AVFoundation -framework ApplicationServices -framework Security"
SLICES=""; BUILT=0
for arch in arm64 x86_64; do
  if swiftc -swift-version 5 -O -target ${arch}-apple-macos14.0 -o "build/VocaNote-$arch" Sources/*.swift $FW 2>"build/err-$arch.log"; then
    SLICES="$SLICES build/VocaNote-$arch"; BUILT=$((BUILT+1)); echo "  ✓ $arch"
  else
    echo "  ✗ $arch 실패 (build/err-$arch.log)"
  fi
done
# 릴리스는 반드시 유니버설 — 한 아키텍처라도 빠지면 실패 처리 (부분 성공 배포 금지)
[ "$BUILT" -eq 2 ] || { echo "❌ 유니버설 빌드 실패 — 일부 아키텍처 누락:"; cat build/err-*.log 2>/dev/null | grep -iE "error" | head -5; exit 1; }
lipo -create -output "$APP/Contents/MacOS/VocaNote" $SLICES
echo "  아키텍처: $(lipo -info "$APP/Contents/MacOS/VocaNote" | sed 's/.*: //')"

codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

ZIP="VocaNote-$VER.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
echo "✅ 릴리스 아티팩트: macos/$ZIP  ($(du -h "$ZIP" | cut -f1))"
