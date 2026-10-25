// Adds what app.json can't hold: build-time settings read from the environment.
//
// Firebase (Android push, FCM): either commit apps/mobile/google-services.json (Firebase client config, not a
// secret), or upload it on expo.dev as a "File" environment variable named GOOGLE_SERVICES_JSON. Without it,
// Android builds still work but get no push token.
//
// Maps (the Riders app map): MapLibre with OpenStreetMap tiles on iOS and Android, no API key
// (components/RiderMap.native.tsx). EXPO_PUBLIC_MAP_STYLE_URL can point it at another MapLibre style.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? "./google-services.json" : undefined);

  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    plugins: [...(config.plugins ?? []), "@maplibre/maplibre-react-native", "./plugins/optional-features"],
  };
};
