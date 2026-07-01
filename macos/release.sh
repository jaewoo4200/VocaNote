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

FW="-framework Cocoa -framework SwiftUI -framework Carbon -framework ServiceManagement -framework AVFoundation -framework ApplicationServices -framework Security"
SLICES=""
for arch in arm64 x86_64; do
  if swiftc -swift-version 5 -O -target ${arch}-apple-macos14.0 -o "build/VocaNote-$arch" Sources/*.swift $FW 2>"build/err-$arch.log"; then
    SLICES="$SLICES build/VocaNote-$arch"; echo "  ✓ $arch"
  else
    echo "  ✗ $arch 실패 (build/err-$arch.log)"
  fi
done
[ -n "$SLICES" ] || { echo "빌드 실패"; exit 1; }
lipo -create -output "$APP/Contents/MacOS/VocaNote" $SLICES
echo "  아키텍처: $(lipo -info "$APP/Contents/MacOS/VocaNote" | sed 's/.*: //')"

codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

ZIP="VocaNote-$VER.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
echo "✅ 릴리스 아티팩트: macos/$ZIP  ($(du -h "$ZIP" | cut -f1))"
