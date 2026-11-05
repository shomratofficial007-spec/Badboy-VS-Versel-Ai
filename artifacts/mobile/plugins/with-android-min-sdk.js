const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Keep the app installable only on Android 14+.
 * Expo SDK 57 uses compile/target SDK 36; this mod changes only the
 * generated app module's minSdkVersion and leaves compile/target intact.
 */
module.exports = function withAndroidMinSdk(config) {
  return withAppBuildGradle(config, (config) => {
    const original = config.modResults.contents;
    const updated = original.replace(
      /(\bminSdkVersion\s+)([^\n;]+)/,
      "$1" + "34"
    );
    if (updated === original) {
      throw new Error(
        "with-android-min-sdk: could not find minSdkVersion in android/app/build.gradle"
      );
    }
    config.modResults.contents = updated;
    return config;
  });
};
