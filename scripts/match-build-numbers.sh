#!/bin/bash
# Makes the Live Activity widget extension's version + build number match the main app.
# Usage: bash scripts/match-build-numbers.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBXPROJ="$ROOT/ios/App/App.xcodeproj/project.pbxproj"
APP_PLIST="$ROOT/ios/App/App/Info.plist"

if [ ! -f "$PBXPROJ" ]; then
  echo "❌ Could not find $PBXPROJ"
  exit 1
fi

PB=/usr/libexec/PlistBuddy

# 1) Read the app's version + build (plist first, then project settings)
VERSION="$($PB -c "Print :CFBundleShortVersionString" "$APP_PLIST" 2>/dev/null || echo "")"
BUILD="$($PB -c "Print :CFBundleVersion" "$APP_PLIST" 2>/dev/null || echo "")"

case "$VERSION" in *'$('*|"") VERSION=""; esac
case "$BUILD" in *'$('*|"") BUILD=""; esac

if [ -z "$VERSION" ]; then
  VERSION="$(grep -m1 'MARKETING_VERSION = ' "$PBXPROJ" | sed 's/.*MARKETING_VERSION = \(.*\);/\1/' | tr -d ' ')"
fi
if [ -z "$BUILD" ]; then
  BUILD="$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$PBXPROJ" | sed 's/.*CURRENT_PROJECT_VERSION = \(.*\);/\1/' | tr -d ' ')"
fi

if [ -z "$VERSION" ] || [ -z "$BUILD" ]; then
  echo "❌ Could not determine app version/build. Version='$VERSION' Build='$BUILD'"
  exit 1
fi

echo "📱 App version: $VERSION  build: $BUILD"

# 2) Apply to every target in the project (safe: app already has these values)
cp "$PBXPROJ" "$PBXPROJ.bak"
sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/g" "$PBXPROJ"
sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD;/g" "$PBXPROJ"

# 3) Also fix any widget Info.plist that hardcodes values
for PLIST in "$ROOT"/ios/App/OwnTheRunActivity*/Info.plist; do
  [ -f "$PLIST" ] || continue
  CUR="$($PB -c "Print :CFBundleVersion" "$PLIST" 2>/dev/null || echo "")"
  case "$CUR" in
    *'$('*) ;; # uses build setting, already handled
    "") ;;
    *)
      $PB -c "Set :CFBundleVersion $BUILD" "$PLIST"
      $PB -c "Set :CFBundleShortVersionString $VERSION" "$PLIST" 2>/dev/null || true
      echo "✅ Updated $PLIST"
      ;;
  esac
done

echo "✅ All targets set to version $VERSION build $BUILD"
echo "Backup of the project file: $PBXPROJ.bak"
echo "Next: in Xcode, Product → Clean Build Folder, then Cmd+B."
