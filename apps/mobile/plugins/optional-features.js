// Google Play treats some permissions as "this phone must have that hardware" (BLUETOOTH needs Bluetooth, CAMERA a
// camera). The voice call's libraries add Bluetooth (for headsets) and the camera permission, which dropped phones
// and tablets without them from the store. Declaring the features optional keeps every device: the app works without
// a headset or a camera. Libraries may declare the same features as required (Korapay's liveness SDK declares the
// camera), and the manifest merger keeps "required" if any of them does, so ours replace theirs (tools:replace).
const { withAndroidManifest } = require("expo/config-plugins");

const OPTIONAL = [
  "android.hardware.bluetooth",
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
  "android.hardware.microphone",
  "android.hardware.location.gps",
  "android.hardware.telephony",
];

module.exports = function withOptionalFeatures(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$["xmlns:tools"] ??= "http://schemas.android.com/tools";
    const features = (manifest["uses-feature"] ??= []);
    for (const name of OPTIONAL) {
      const existing = features.find((feature) => feature.$["android:name"] === name);
      const attrs = { "android:required": "false", "tools:replace": "android:required" };
      if (existing) Object.assign(existing.$, attrs);
      else features.push({ $: { "android:name": name, ...attrs } });
    }
    return mod;
  });
};
