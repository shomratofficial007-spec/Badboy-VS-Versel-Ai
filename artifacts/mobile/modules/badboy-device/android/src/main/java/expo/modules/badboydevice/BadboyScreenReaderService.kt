package expo.modules.badboydevice

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.ArrayDeque

/**
 * Reads visible UI text only on an explicit user request. It never clicks,
 * types, captures screenshots, records events, or stores screen contents.
 */
class BadboyScreenReaderService : AccessibilityService() {
  override fun onServiceConnected() { super.onServiceConnected(); activeInstance = this }
  override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* No event text is cached. */ }
  override fun onInterrupt() = Unit
  override fun onDestroy() { if (activeInstance === this) activeInstance = null; super.onDestroy() }

  fun readCurrentScreen(ownPackage: String): String? {
    val root = rootInActiveWindow ?: return null
    return collectVisibleText(root)
  }

  fun readOtherAppScreen(ownPackage: String): String? = try {
    windows.asSequence()
      .mapNotNull { window -> window.root }
      .firstOrNull { node -> node.packageName?.toString()?.let { it != ownPackage } == true }
      ?.let(::collectVisibleText)
  } catch (_: Exception) { null }

  private fun collectVisibleText(root: AccessibilityNodeInfo): String? {
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    val seen = HashSet<String>()
    val output = StringBuilder()
    queue.add(root)
    var visited = 0
    while (queue.isNotEmpty() && visited < 140 && output.length < 4_500) {
      val node = queue.removeFirst()
      visited += 1
      if (!node.isPassword && !node.isEditable) {
        val candidates = listOfNotNull(
          node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() },
          node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() },
        )
        for (candidate in candidates) {
          val safe = redactPrivatePatterns(candidate).take(260)
          if (safe.isNotBlank() && seen.add(safe)) {
            if (output.isNotEmpty()) output.append('\n')
            output.append(safe)
            if (output.length >= 4_500) break
          }
        }
      }
      for (index in 0 until node.childCount) {
        try { node.getChild(index)?.let(queue::addLast) } catch (_: Exception) { /* Window changed */ }
      }
    }
    return output.toString().trim().takeIf { it.isNotEmpty() }
  }

  private fun redactPrivatePatterns(value: String): String =
    value.replace(EMAIL_PATTERN, "[email]").replace(PHONE_PATTERN, "[phone]")

  companion object {
    private val EMAIL_PATTERN = Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", RegexOption.IGNORE_CASE)
    private val PHONE_PATTERN = Regex("\\+?\\d[\\d\\s().-]{7,}\\d")
    @Volatile private var activeInstance: BadboyScreenReaderService? = null
    fun readCurrentScreen(ownPackage: String): String? = activeInstance?.readCurrentScreen(ownPackage)
    fun readOtherAppScreen(ownPackage: String): String? = activeInstance?.readOtherAppScreen(ownPackage)
  }
}
