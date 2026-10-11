// Metro config: the app imports design tokens and onboarding content from ../../shared (also used by the web app).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../../shared")];

module.exports = config;
