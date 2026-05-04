## Plan: Generate Catch Up app icon (iOS + Android)

### Step 1 — Generate the icon with AI

Use Lovable AI (`google/gemini-3-pro-image-preview` for max quality) to generate a 1024×1024 master icon:

- Bold "C" mark on lime-green (#c6f700) background
- Subtle running/motion element (chevron, motion lines, or stylized runner silhouette)
- Flat, modern, app-store style — no drop shadows, no transparency, no rounded corners (Apple/Google add those)
- Save master to `/mnt/documents/catchup-icon-1024.png` so you can preview before we commit

I'll show you the result first. If you don't like it, I'll regenerate with tweaks before continuing.

### Step 2 — Generate all required sizes

Once approved, use ImageMagick to slice the 1024 master into every size iOS and Android need:

**iOS** (`ios/App/App/Assets.xcassets/AppIcon.appiconset/`):
- 20pt, 29pt, 40pt, 60pt, 76pt, 83.5pt, 1024pt — all @1x/@2x/@3x variants (~18 PNGs)
- Updated `Contents.json` manifest

**Android** (`android/app/src/main/res/`):
- mipmap-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi (48–192 px)
- Both `ic_launcher.png` and `ic_launcher_round.png`
- Adaptive icon: foreground + background layers in `mipmap-anydpi-v26/`

### Step 3 — Wire into Capacitor

Use the `@capacitor/assets` tool (industry standard) to handle the generation cleanly:

```bash
bun add -D @capacitor/assets
# Place 1024 master at resources/icon.png
bunx capacitor-assets generate --iconBackgroundColor "#c6f700" --iconBackgroundColorDark "#0a0a0a"
```

This auto-generates and places every icon in the right `ios/` and `android/` folders.

### Step 4 — What you do on your Mac

```bash
git pull
bun install
bunx cap sync ios
bunx cap sync android   # if you set up Android too
bunx cap open ios
```

Rebuild in Xcode → new icon appears on your phone. For TestFlight, the new icon ships with the next archive.

### Notes

- Web favicon stays separate (already in `public/`) — this plan only covers the native app icon
- I won't touch your published web build at all
- Total time on my side: ~5 min generate + place files. Your side: ~2 min sync + rebuild.

Approve and I'll generate the icon for your review first.