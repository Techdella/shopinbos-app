// Adds what app.json can't hold: build-time settings read from the environment.
//
// Firebase (Android push, FCM): either commit apps/mobile/google-services.json (Firebase client config, not a
// secret), or upload it on expo.dev as a "File" environment variable named GOOGLE_SERVICES_JSON. Without it,
// Android builds still work but get no push token.
//
// Maps (the Riders app map): MapLibre with OpenStreetMap tiles on iOS and Android, no API key
// (components/RiderMap.native.tsx). EXPO_PUBLIC_MAP_STYLE_URL can point it at another MapLibre style.
//
// Store builds: EAS sets EAS_BUILD_PROFILE, and the "production" profile is what goes to the App Store and Google
// Play. Those builds are marked extra.storeBuild, and the app then never shows the prepaid wallet balance or the
// wallet account number (src/lib/wallet.ts), whatever EXPO_PUBLIC_* settings the build picked up: a stored balance
// is a digital wallet, which both stores allow only from organization developer accounts.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? "./google-services.json" : undefined);

  const storeBuild = process.env.EAS_BUILD_PROFILE === "production";

  return {
    ...config,
    extra: { ...config.extra, storeBuild },
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    plugins: [...(config.plugins ?? []), "@maplibre/maplibre-react-native", "./plugins/optional-features"],
  };
};
