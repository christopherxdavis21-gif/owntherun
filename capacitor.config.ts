/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.catchup.run",
  appName: "Catch Up",
  webDir: ".output/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    BackgroundGeolocation: {
      // The Android foreground-service notification shown while a run records.
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
