// expo-gl tries to load Reanimated for worklet contexts, inside a try/catch. The game doesn't use them, so metro.config.js
// points that one import here: it throws, expo-gl falls back, and Reanimated's native side is never started.
throw new Error('Reanimated is not used by the game');
