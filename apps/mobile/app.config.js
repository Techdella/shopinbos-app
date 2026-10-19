// Adds the Firebase config Android needs for push notifications (FCM), once it exists. Everything else is in app.json.
// Either commit apps/mobile/google-services.json (Firebase client config, not a secret), or upload it on expo.dev as a
// "File" environment variable named GOOGLE_SERVICES_JSON. Without it, Android builds still work but get no push token.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? "./google-services.json" : undefined);
  return googleServicesFile ? { ...config, android: { ...config.android, googleServicesFile } } : config;
};
