// Adds what app.json can't hold: build-time settings read from the environment.
//
// Firebase (Android push, FCM): either commit apps/mobile/google-services.json (Firebase client config, not a
// secret), or upload it on expo.dev as a "File" environment variable named GOOGLE_SERVICES_JSON. Without it,
// Android builds still work but get no push token.
//
// Maps (the Riders app map, react-native-maps): iOS uses Apple Maps and needs no key. Android uses Google Maps and
// needs GOOGLE_MAPS_ANDROID_API_KEY (an EAS environment variable, or in your shell for local builds), restricted
// to the com.shopinbos.app package and the Maps SDK for Android. Without it the Android build still works: the app
// reads extra.mapsAvailable = false and draws its plain map panel instead of a real map (a Google map without a
// key would crash). Expo Go has its own Google Maps key, so maps work there either way.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? "./google-services.json" : undefined);
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() || undefined;

  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    plugins: [...(config.plugins ?? []), ["react-native-maps", androidMapsKey ? { androidGoogleMapsApiKey: androidMapsKey } : {}]],
    extra: { ...config.extra, mapsAvailable: Boolean(androidMapsKey) },
  };
};
