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
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast

class FloatingAssistantService : Service() {
  private var windowManager: WindowManager? = null
  private var bubble: TextView? = null
  private var downX = 0f
  private var downY = 0f
  private var startX = 0
  private var startY = 0
  private var moved = false
  private var downAt = 0L

  override fun onCreate() { super.onCreate(); createNotificationChannel() }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!android.provider.Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY }
    startForegroundCompat()
    if (bubble == null) {
      try { showBubble() } catch (_: Exception) { stopSelf(); return START_NOT_STICKY }
    }
    return START_STICKY
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Badboy Floating Assistant", NotificationManager.IMPORTANCE_LOW)
      )
    }
  }

  private fun startForegroundCompat() {
    val openIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = openIntent?.let {
      it.data = Uri.parse("badboyai://jarvis")
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      PendingIntent.getActivity(this, 7411, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    builder.setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("Badboy Jarvis is ready")
      .setContentText("Tap the bubble to open. Long-press to capture visible screen text.")
      .setOngoing(true)
    if (pending != null) builder.setContentIntent(pending)
    val notification = builder.build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(NOTIFICATION_ID, notification)
  }

  private fun showBubble() {
    val manager = getSystemService(WINDOW_SERVICE) as WindowManager
    val view = TextView(this).apply {
      text = "B"; textSize = 23f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
      typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.rgb(91, 39, 190)); setStroke(dp(3), Color.rgb(238, 47, 91)) }
      elevation = dp(10).toFloat()
      contentDescription = "Badboy Jarvis. Tap to open; long-press to capture the current screen."
    }
    val params = WindowManager.LayoutParams(
      dp(58), dp(58),
      if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(16); y = dp(230) }

    view.setOnTouchListener { target, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          downX = event.rawX; downY = event.rawY; startX = params.x; startY = params.y
          moved = false; downAt = System.currentTimeMillis(); true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = (event.rawX - downX).toInt(); val dy = (event.rawY - downY).toInt()
          if (kotlin.math.abs(dx) > dp(5) || kotlin.math.abs(dy) > dp(5)) moved = true
          if (moved) {
            params.x = (startX + dx).coerceAtLeast(0); params.y = (startY + dy).coerceAtLeast(0)
            try { manager.updateViewLayout(target, params) } catch (_: Exception) { /* Overlay is closing */ }
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!moved) {
            if (System.currentTimeMillis() - downAt >= LONG_PRESS_MS) {
              val context = BadboyScreenReaderService.readOtherAppScreen(packageName)
              if (context.isNullOrBlank()) {
                Toast.makeText(this, "Screen Awareness চালু করতে Android Accessibility settings-এ Badboy Screen Reader enable করুন।", Toast.LENGTH_LONG).show()
                openAssistant(null)
              } else openAssistant(context)
            } else openAssistant(null)
          }
          true
        }
        else -> true
      }
    }
    manager.addView(view, params)
    windowManager = manager
    bubble = view
  }

  private fun openAssistant(screenContext: String?) {
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    val uri = Uri.Builder().scheme("badboyai").authority("jarvis").apply {
      if (!screenContext.isNullOrBlank()) appendQueryParameter("screen_context", screenContext.take(4_500))
    }.build()
    intent.data = uri
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    try { startActivity(intent) } catch (_: Exception) { Toast.makeText(this, "Badboy AI খুলতে সমস্যা হয়েছে।", Toast.LENGTH_SHORT).show() }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  override fun onDestroy() {
    try { bubble?.let { windowManager?.removeView(it) } } catch (_: Exception) { /* Already detached */ }
    bubble = null; windowManager = null; stopForeground(true); super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val CHANNEL_ID = "badboy_floating_assistant"
    private const val NOTIFICATION_ID = 7410
    private const val LONG_PRESS_MS = 650L
  }
}
