#!/usr/bin/env bash
# Recreates ios/App/App/Assets.xcassets with a valid AppIcon set.
# Run from the project root:  bash scripts/fix-ios-appicon.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/ios/App/App/Assets.xcassets"
ICONSET="$ASSETS/AppIcon.appiconset"
SRC="$ROOT/public/app-icons/icon-1024.png"

if [ ! -f "$SRC" ]; then
  echo "ERROR: $SRC not found. Run 'git pull' first."
  exit 1
fi

mkdir -p "$ICONSET"

cat > "$ASSETS/Contents.json" <<'JSON'
{
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

cp "$SRC" "$ICONSET/AppIcon-1024.png"

cat > "$ICONSET/Contents.json" <<'JSON'
{
  "images" : [
    {
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

echo "Done. Created:"
echo "  $ICONSET/AppIcon-1024.png"
echo "  $ICONSET/Contents.json"
echo "Now in Xcode: Product > Clean Build Folder (Shift+Cmd+K), then Cmd+B."
