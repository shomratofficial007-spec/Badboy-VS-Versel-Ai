package expo.modules.badboywakeword

import android.content.Intent
import android.os.Build
import android.os.Bundle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BadboyWakeWordModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BadboyWakeWord")
    Events("onWakeWordDetected", "onWakeWordStatus")
    OnCreate { BadboyWakeWordBridge.emit = { name, payload -> sendEvent(name, payload) } }
    OnDestroy { BadboyWakeWordBridge.emit = null }
    Function("isSupported") { Build.VERSION.SDK_INT >= 34 }
    AsyncFunction("getStatus") { BadboyWakeWordBridge.status() }
    AsyncFunction("start") { options: Map<String, Double>? ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context unavailable")
      if (Build.VERSION.SDK_INT < 34) throw IllegalStateException("Android 14 or newer is required")
      val threshold = options?.get("threshold") ?: 0.696
      if (threshold <= 0.0 || threshold >= 1.0) throw IllegalArgumentException("Invalid wake threshold")
      val intent = Intent(context, BadboyWakeWordService::class.java).putExtra("threshold", threshold)
      BadboyWakeWordBridge.update("starting", false)
      try {
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      } catch (cause: Exception) {
        BadboyWakeWordBridge.update("error", false, cause.message ?: "Wake word service could not start.")
        throw cause
      }
      Bundle().apply { putString("state", "starting"); putBoolean("enabled", true); putBoolean("modelLoaded", false) }
    }
    AsyncFunction("stop") {
      val context = appContext.reactContext
      context?.stopService(Intent(context, BadboyWakeWordService::class.java))
      BadboyWakeWordBridge.stopped()
      BadboyWakeWordBridge.status()
    }
  }
}

internal object BadboyWakeWordBridge {
  @Volatile var emit: ((String, Bundle) -> Unit)? = null
  @Volatile var state = "stopped"
  @Volatile var loaded = false
  fun status() = Bundle().apply {
    putString("state", state); putBoolean("enabled", state == "listening" || state == "starting")
    putBoolean("modelLoaded", loaded)
  }
  fun stopped() { state = "stopped"; loaded = false }
  fun update(next: String, modelLoaded: Boolean = loaded, message: String? = null) {
    state = next; loaded = modelLoaded
    val data = status(); if (message != null) data.putString("message", message)
    emit?.invoke("onWakeWordStatus", data)
  }
  fun detected(confidence: Float) {
    val data = Bundle().apply { putString("phrase", "hey-badboy"); putDouble("confidence", confidence.toDouble()); putLong("timestamp", System.currentTimeMillis()) }
    emit?.invoke("onWakeWordDetected", data)
  }
}
