package expo.modules.badboydevice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast
import kotlin.math.abs

class FloatingAssistantService : Service() {
  private var windowManager: WindowManager? = null
  private var bubble: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(WINDOW_SERVICE) as? WindowManager
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return try {
      if (!Settings.canDrawOverlays(this)) {
        stopSelf()
        START_NOT_STICKY
      } else {
        startForegroundCompat()
        if (bubble == null) showBubble()
        START_STICKY
      }
    } catch (_: Exception) {
      // Android may reject a foreground-service start if permission or OS
      // policy changed between the caller's check and this service callback.
      stopSelf()
      START_NOT_STICKY
    }
  }

  private fun showBubble() {
    val manager = windowManager ?: return
    val bubbleView = TextView(this).apply {
      text = "B"
      textSize = 18f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      contentDescription = "Badboy AI floating assistant. Tap to open chat. Long-press to read visible text."
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        colors = intArrayOf(Color.rgb(0, 217, 255), Color.rgb(32, 93, 220))
        setStroke(dp(2), Color.WHITE)
      }
      elevation = dp(8).toFloat()
    }

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      dp(58),
      dp(58),
      overlayType,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.END or Gravity.TOP
      x = dp(16)
      y = dp(180)
    }

    var downX = 0f
    var downY = 0f
    var startX = 0
    var startY = 0
    var downAt = 0L
    var moved = false

    bubbleView.setOnTouchListener { view, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX
          downY = event.rawY
          startX = params.x
          startY = params.y
          downAt = System.currentTimeMillis()
          moved = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (abs(dx) > dp(8) || abs(dy) > dp(8)) moved = true

          // END gravity measures x from the right edge, so horizontal drag
          // must be inverted to follow the user's finger.
          val maxX = (resources.displayMetrics.widthPixels - dp(58)).coerceAtLeast(0)
          val maxY = (resources.displayMetrics.heightPixels - dp(58)).coerceAtLeast(0)
          params.x = (startX - dx.toInt()).coerceIn(0, maxX)
          params.y = (startY + dy.toInt()).coerceIn(0, maxY)
          try {
            manager.updateViewLayout(view, params)
          } catch (_: Exception) {
            moved = true
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          val heldFor = System.currentTimeMillis() - downAt
          if (!moved) {
            if (heldFor >= LONG_PRESS_MS) {
              val screenContext = BadboyScreenReaderService.readOtherAppScreen(packageName)
              if (screenContext.isNullOrBlank()) {
                Toast.makeText(
                  this,
                  "No readable text. Enable Screen Awareness in Android Accessibility settings.",
                  Toast.LENGTH_LONG,
                ).show()
              }
              openAssistant(screenContext)
            } else {
              openAssistant(null)
            }
          }
          downAt = 0L
          moved = false
          true
        }
        MotionEvent.ACTION_CANCEL -> {
          downAt = 0L
          moved = false
          true
        }
        else -> false
      }
    }

    try {
      manager.addView(bubbleView, params)
      bubble = bubbleView
      layoutParams = params
    } catch (_: Exception) {
      bubble = null
      layoutParams = null
      stopSelf()
    }
  }

  private fun openAssistant(screenContext: String?) {
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    val uriBuilder = Uri.Builder()
      .scheme("badboyai")
      .authority("jarvis")
    if (!screenContext.isNullOrBlank()) {
      uriBuilder.appendQueryParameter("screen_context", screenContext.take(MAX_SCREEN_CONTEXT_CHARS))
    }
    intent.data = uriBuilder.build()
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP,
    )
    try {
      startActivity(intent)
    } catch (_: Exception) {
      Toast.makeText(this, "Could not open Badboy AI.", Toast.LENGTH_SHORT).show()
    }
  }

  private fun startForegroundCompat() {
    val channelId = "badboy_jarvis_floating"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        channelId,
        "Badboy AI floating assistant",
        NotificationManager.IMPORTANCE_LOW,
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      it.data = Uri.parse("badboyai://jarvis")
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      PendingIntent.getActivity(
        this,
        NOTIFICATION_REQUEST_CODE,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }.setContentTitle("Badboy AI")
      .setContentText("Jarvis is ready. Tap to open chat; long-press the bubble to read visible text.")
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun onDestroy() {
    try {
      bubble?.let { windowManager?.removeView(it) }
    } catch (_: Exception) {
      // The overlay may already have been detached by the system.
    } finally {
      bubble = null
      layoutParams = null
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val NOTIFICATION_ID = 7101
    private const val NOTIFICATION_REQUEST_CODE = 7102
    private const val LONG_PRESS_MS = 650L
    private const val MAX_SCREEN_CONTEXT_CHARS = 4_500
  }
}
