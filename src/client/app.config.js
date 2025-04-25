export default ({
  name: 'Kodo',
  slug: 'kodo',
  privacy: 'public',
  platforms: ['ios', 'android'],
  primaryColor: '#5762D5',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#5762D5',
  },
  extra: {
    serverUrl: process.env.SERVER_URL || 'http://localhost:3001',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.yourcompany.kodo',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#5762D5',
    },
    package: 'com.yourcompany.kodo',
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Kodo to access your camera to scan QR codes.',
      },
    ],
    [
      'expo-barcode-scanner',
      {
        cameraPermission: 'Allow Kodo to access your camera to scan QR codes.',
      },
    ],
  ],
});
