// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// game data: converted 3D models (.glb) and HDR skies
config.resolver.assetExts.push('glb', 'hdr', 'bin');

module.exports = config;
