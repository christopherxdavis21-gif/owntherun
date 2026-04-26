/**
 * Capacitor configuration for the native iOS / Android wrapper.
 *
 * This file is consumed by the Capacitor CLI (`@capacitor/cli`) only when
 * you run `npx cap` commands locally. The web build never imports it, so
 * we keep it as a plain JS-style export with a manually-typed shape to
 * avoid forcing every web build to install Capacitor packages.
 *
 * See README-mobile.md for the full setup walkthrough.
 */

const config = {
  appId: "app.catchup.run",
  appName: "Catch Up",
  webDir: ".output/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    BackgroundGeolocation: {
      notificationTitle: "Catch Up — Recording run",
      notificationText: "Tap to return to your run",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_run",
      iconColor: "#c6f700",
    },
  },
};

export default config;
