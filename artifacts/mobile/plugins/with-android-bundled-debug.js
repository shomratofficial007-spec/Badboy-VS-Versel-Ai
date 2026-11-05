const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Make the debug APK self-contained.
 *
 * React Native intentionally skips JS bundling for the standard debug
 * variant. CI APKs are installed without Metro, so explicitly remove debug
 * from the debuggable variants list.
 */
module.exports = function withAndroidBundledDebug(config) {
  return withAppBuildGradle(config, (config) => {
    const original = config.modResults.contents;
    const reactBlock = /(react\\s*\\{)/;

    if (!reactBlock.test(original)) {
      throw new Error(
        "with-android-bundled-debug: could not find the React Native Gradle react block"
      );
    }

    // Remove only active declarations. Do not mistake commented examples in
    // the generated Gradle template for real configuration.
    const withoutActiveDeclaration = original.replace(
      /^[ \\t]*debuggableVariants\\s*=\\s*\\[[^\\]]*\\][ \\t]*$/gm,
      ""
    );

    config.modResults.contents = withoutActiveDeclaration.replace(
      reactBlock,
      "$1\\n    // Include the JS bundle in CI debug APKs; Metro is not available on-device.\\n    debuggableVariants = []"
    );

    if (!/react\\s*\\{[\\s\\S]*?debuggableVariants\\s*=\\s*\\[\\s*\\]/.test(config.modResults.contents)) {
      throw new Error(
        "with-android-bundled-debug: failed to inject debuggableVariants = []"
      );
    }

    return config;
  });
};
