/**
 * Capacitor configuration for the native iOS / Android wrapper.
 *
 * This file is consumed by the Capacitor CLI (`@capacitor/cli`) only when
 * you run `npx cap` commands locally. The web build never imports it.
 *
 * Strategy: the iOS app is a thin native shell that loads the live
 * deployed web app (`server.url`) inside its WebView. Native plugins
 * (background GPS, local notifications, Live Activities) still work
 * normally because the app itself is a real iOS binary. This is the same
 * approach used by many production fitness apps and lets us push web
 * updates instantly without going through App Review every time.
 *
 * `webDir` still has to point at a folder containing an index.html for
 * `cap sync` to succeed — we use a tiny offline-fallback shim under
 * public/capacitor-shim. That page only shows if the device has no
 * connection on first launch.
 *
 * See README-mobile.md for the full setup walkthrough.
 */

const config = {
  appId: "app.catchup.run",
  appName: "Own The Run",
  webDir: "public/capacitor-shim",
  server: {
    androidScheme: "https",
    url: "https://owntherun.lovable.app",
    cleartext: false,
  },
  plugins: {
    BackgroundGeolocation: {
      notificationTitle: "Own The Run — Recording run",
      notificationText: "Tap to return to your run",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_run",
      iconColor: "#c6f700",
    },
  },
};

export default config;
