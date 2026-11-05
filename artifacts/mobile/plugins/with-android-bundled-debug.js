const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Make the debug APK self-contained.
 *
 * Expo/React Native normally treats the debug variant as debuggable and
 * expects Metro to serve its JavaScript bundle at runtime. CI-built APKs
 * are installed on devices without Metro, so bundle the JS into the APK.
 */
module.exports = function withAndroidBundledDebug(config) {
  return withAppBuildGradle(config, (config) => {
    const original = config.modResults.contents;

    if (!/react\s*\{/.test(original)) {
      throw new Error(
        "with-android-bundled-debug: could not find the React Native Gradle react block"
      );
    }

    if (/debuggableVariants\s*=/.test(original)) {
      config.modResults.contents = original.replace(
        /debuggableVariants\s*=\s*\[[^\]]*\]/,
        "debuggableVariants = []"
      );
      if (config.modResults.contents === original) {
        throw new Error(
          "with-android-bundled-debug: found an unsupported debuggableVariants declaration"
        );
      }
      return config;
    }

    config.modResults.contents = original.replace(
      /(react\s*\{)/,
      "$1\n    // Bundle JS in CI debug APKs so Metro is not required on-device.\n    debuggableVariants = []"
    );

    return config;
  });
};
