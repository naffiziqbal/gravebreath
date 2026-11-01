// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// game data: converted 3D models (.glb) and HDR skies
config.resolver.assetExts.push('glb', 'hdr', 'bin');

// expo-gl only: don't start Reanimated just because the GL view was imported (see src/game/engine/noReanimated.js)
const noReanimated = path.join(__dirname, 'src/game/engine/noReanimated.js');
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === 'react-native-reanimated' && context.originModulePath.includes(`${path.sep}expo-gl${path.sep}`)) {
    return { type: 'sourceFile', filePath: noReanimated };
  }
  return (resolve ?? context.resolveRequest)(context, name, platform);
};

module.exports = config;
