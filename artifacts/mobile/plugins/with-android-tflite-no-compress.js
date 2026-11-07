const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * TFLite is loaded with AssetManager.openFd(), which requires an uncompressed
 * APK asset. Configure the app module's Android resource packaging accordingly.
 */
module.exports = function withAndroidTfliteNoCompress(config) {
  return withAppBuildGradle(config, (config) => {
    const original = config.modResults.contents;

    if (/androidResources\s*\{[\s\S]*?noCompress[^\n]*tflite/.test(original)) {
      return config;
    }

    const androidBlock = /(android\s*\{)/;
    if (!androidBlock.test(original)) {
      throw new Error(
        "with-android-tflite-no-compress: could not find android block in app/build.gradle"
      );
    }

    config.modResults.contents = original.replace(
      androidBlock,
      "$1\n    androidResources {\n        noCompress += ['tflite']\n    }"
    );

    if (!/androidResources\s*\{[\s\S]*?noCompress\s*\+=\s*\[['"]tflite['"]\]/.test(config.modResults.contents)) {
      throw new Error(
        "with-android-tflite-no-compress: failed to configure uncompressed TFLite assets"
      );
    }

    return config;
  });
};
