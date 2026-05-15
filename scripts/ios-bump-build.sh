#!/bin/bash
# Auto-bump iOS CFBundleVersion on Archive builds.
#
# Setup (one time):
#   1. Copy this file into your iOS project, e.g.
#        ios/App/scripts/ios-bump-build.sh
#      (or keep it here and reference the absolute path)
#   2. chmod +x ios/App/scripts/ios-bump-build.sh
#   3. In Xcode: select the "App" target -> Build Phases -> "+" ->
#      "New Run Script Phase". Drag it ABOVE "Compile Sources".
#      Name it "Bump Build Number". Paste:
#
#         "${SRCROOT}/scripts/ios-bump-build.sh"
#
#      Uncheck "Based on dependency analysis" so it runs every build.
#
# Behavior:
#   - On Release/Archive builds: sets CFBundleVersion to a UTC timestamp
#     (YYYYMMDDHHMM) — always larger than the previous upload.
#   - On Debug builds: no-op (keeps Xcode fast).
#   - CFBundleShortVersionString (the user-facing "1.1.0") is left alone —
#     bump that manually when you cut a real release.

set -euo pipefail

if [ "${CONFIGURATION:-}" != "Release" ]; then
  echo "ios-bump-build: skipping ($CONFIGURATION build)"
  exit 0
fi

PLIST="${INFOPLIST_FILE:-App/Info.plist}"
PLIST_PATH="${SRCROOT}/${PLIST}"

if [ ! -f "$PLIST_PATH" ]; then
  echo "ios-bump-build: Info.plist not found at $PLIST_PATH" >&2
  exit 1
fi

NEW_BUILD="$(date -u +%Y%m%d%H%M)"

/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" "$PLIST_PATH"
echo "ios-bump-build: CFBundleVersion -> $NEW_BUILD"
