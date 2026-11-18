package expo.modules.badboydevice

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BadboyJarvisModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BadboyJarvis")
    Function("canDrawOverlays") {
      val context = appContext.reactContext ?: return@Function false
      Settings.canDrawOverlays(context)
    }
    AsyncFunction("openOverlayPermissionSettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context unavailable")
      context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }
    AsyncFunction("startFloatingAssistant") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context unavailable")
      if (!Settings.canDrawOverlays(context)) throw SecurityException("Allow display over other apps before enabling the floating assistant.")
      val intent = Intent(context, FloatingAssistantService::class.java)
      if (android.os.Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      true
    }
    AsyncFunction("stopFloatingAssistant") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context unavailable")
      context.stopService(Intent(context, FloatingAssistantService::class.java))
      true
    }
    Function("isAccessibilityEnabled") {
      val context = appContext.reactContext ?: return@Function false
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return@Function false
      val expected = ComponentName(context, BadboyScreenReaderService::class.java).flattenToString()
      enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }
    AsyncFunction("openAccessibilitySettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context unavailable")
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    }
    AsyncFunction("readVisibleScreenText") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context unavailable")
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      val expected = ComponentName(context, BadboyScreenReaderService::class.java).flattenToString()
      if (enabled.split(':').none { it.equals(expected, ignoreCase = true) }) throw SecurityException("Enable Badboy Screen Awareness in Android Accessibility settings first.")
      BadboyScreenReaderService.readCurrentScreen(context.packageName) ?: throw IllegalStateException("No readable screen is currently available.")
    }
  }
}
