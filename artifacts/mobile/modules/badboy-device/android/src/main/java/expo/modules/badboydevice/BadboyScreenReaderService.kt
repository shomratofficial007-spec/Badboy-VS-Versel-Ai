package expo.modules.badboydevice

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import java.util.ArrayDeque

/**
 * Reads visible UI text only after an explicit user action.
 *
 * It does not inspect accessibility events, click, type, capture screenshots,
 * record content, or persist screen text. Returned text is bounded and
 * best-effort redacted before it leaves the Android service.
 */
class BadboyScreenReaderService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    activeInstance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Deliberately do not read or cache event content.
  }

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    if (activeInstance === this) activeInstance = null
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    if (activeInstance === this) activeInstance = null
    super.onDestroy()
  }

  fun readCurrentScreen(ownPackage: String): String? {
    val root = try {
      rootInActiveWindow
    } catch (_: Exception) {
      null
    } ?: return null

    if (root.packageName?.toString() != ownPackage) {
      try {
        root.recycle()
      } catch (_: Exception) {
        // Ignore an already-released root node.
      }
      return null
    }

    // collectVisibleText takes ownership and recycles every node.
    return collectVisibleText(root)
  }

  fun readOtherAppScreen(ownPackage: String): String? {
    val allWindows = try {
      windows.toList()
    } catch (_: Exception) {
      return null
    }

    try {
      val candidates = allWindows
        .filter { window ->
          window.type == AccessibilityWindowInfo.TYPE_APPLICATION &&
            (window.isFocused || window.isActive)
        }
        .sortedByDescending { it.isFocused }

      for (window in candidates) {
        var root: AccessibilityNodeInfo? = null
        try {
          root = window.root ?: continue
          val packageName = root.packageName?.toString()
          if (packageName.isNullOrBlank() || packageName == ownPackage) continue

          val selectedRoot = root
          root = null // Ownership transfers to collectVisibleText.
          val text = collectVisibleText(selectedRoot)
          if (!text.isNullOrBlank()) return text
        } catch (_: Exception) {
          // A window may disappear while the user is switching applications.
        } finally {
          try {
            root?.recycle()
          } catch (_: Exception) {
            // Ignore an already-released root node.
          }
        }
      }
    } catch (_: Exception) {
      return null
    } finally {
      // AccessibilityWindowInfo instances returned by getWindows are recyclable.
      allWindows.forEach { window ->
        try {
          window.recycle()
        } catch (_: Exception) {
          // Ignore windows already released by the framework.
        }
      }
    }

    return null
  }

  /**
   * Takes ownership of root. Every obtained AccessibilityNodeInfo is
   * recycled, including queued children left behind when either bound is hit.
   */
  private fun collectVisibleText(root: AccessibilityNodeInfo): String? {
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    val seen = HashSet<String>()
    val output = StringBuilder()
    queue.add(root)
    var visited = 0

    try {
      while (queue.isNotEmpty() && visited < MAX_VISITED_NODES && output.length < MAX_OUTPUT_CHARS) {
        val node = queue.removeFirst()
        visited += 1
        try {
          // Skip editable/password subtrees so text nested inside them is not read.
          if (!node.isPassword && !node.isEditable) {
            val candidates = listOfNotNull(
              node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() },
              node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() },
            )

            for (candidate in candidates) {
              val safe = redactPrivatePatterns(candidate).take(MAX_NODE_TEXT_CHARS)
              if (safe.isNotBlank() && seen.add(safe)) {
                if (output.isNotEmpty()) output.append('\n')
                output.append(safe)
                if (output.length >= MAX_OUTPUT_CHARS) break
              }
            }

            val remainingNodeBudget = (MAX_VISITED_NODES - visited - queue.size).coerceAtLeast(0)
            val childCount = node.childCount.coerceAtMost(remainingNodeBudget)
            for (index in 0 until childCount) {
              try {
                node.getChild(index)?.let(queue::addLast)
              } catch (_: Exception) {
                // The accessibility tree can change while it is traversed.
              }
            }
          }
        } finally {
          try {
            node.recycle()
          } catch (_: Exception) {
            // Continue draining any queued nodes.
          }
        }
      }
    } finally {
      // The node/character bounds can leave children in the queue.
      while (queue.isNotEmpty()) {
        try {
          queue.removeFirst().recycle()
        } catch (_: Exception) {
          // Continue releasing the remaining nodes.
        }
      }
    }

    return output.toString().trim().take(MAX_OUTPUT_CHARS).takeIf { it.isNotEmpty() }
  }

  private fun redactPrivatePatterns(value: String): String {
    val preservedDates = mutableListOf<String>()
    val protectedValue = ISO_DATE_PATTERN.replace(value) { match ->
      val index = preservedDates.size
      preservedDates.add(match.value)
      "__BADBOY_DATE_" + index + "__"
    }

    val redacted = protectedValue
      .replace(EMAIL_PATTERN, "[email]")
      .replace(OTP_PATTERN, "$1: [code]")
      .replace(PASSWORD_PATTERN, "$1: [redacted]")
      .replace(API_CREDENTIAL_PATTERN, "$1: [redacted]")
      .replace(AUTHORIZATION_PATTERN, "$1 [redacted]")
      .replace(COOKIE_PATTERN, "$1[redacted]")
      .replace(URL_SECRET_PATTERN, "$1[redacted]")
      .replace(JWT_PATTERN, "[token]")
      .replace(SECRET_TOKEN_PATTERN, "[secret token]")
      .replace(CARD_NUMBER_PATTERN, "[card number]")
      .replace(PHONE_OR_ACCOUNT_PATTERN, "[phone/account number]")

    return DATE_PLACEHOLDER_PATTERN.replace(redacted) { match ->
      preservedDates.getOrNull(match.groupValues[1].toIntOrNull() ?: -1) ?: ""
    }
  }

  companion object {
    private const val MAX_VISITED_NODES = 140
    private const val MAX_OUTPUT_CHARS = 4_500
    private const val MAX_NODE_TEXT_CHARS = 260

    private val EMAIL_PATTERN = Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", RegexOption.IGNORE_CASE)
    private val CARD_NUMBER_PATTERN = Regex("\\b(?:\\d[ -]?){13,19}\\b")
    private val PHONE_OR_ACCOUNT_PATTERN = Regex("\\+?\\d(?:[\\s().-]*\\d){9,}")
    private val OTP_PATTERN = Regex("\\b(OTP|one[- ]time code|verification code|security code|2FA code)\\s*[:= -]?\\s*\\d{4,8}\\b", RegexOption.IGNORE_CASE)
    private val PASSWORD_PATTERN = Regex("\\b(password|passcode|pin|security answer|secret)\\s*[:=]\\s*[^\\r\\n]+", RegexOption.IGNORE_CASE)
    private val API_CREDENTIAL_PATTERN = Regex("\\b(api[-_ ]?key|access token|refresh token|client secret|secret key)\\s*[:=]\\s*[^\\r\\n]+", RegexOption.IGNORE_CASE)
    private val AUTHORIZATION_PATTERN = Regex("\\b(authorization\\s*[:=]\\s*(?:bearer|basic))\\s+\\S+", RegexOption.IGNORE_CASE)
    private val COOKIE_PATTERN = Regex("\\b(cookie\\s*[:=]\\s*)[^\\r\\n]+", RegexOption.IGNORE_CASE)
    private val URL_SECRET_PATTERN = Regex("([?&](?:access_token|api_key|token|key|secret|password|auth|code|session)=)[^&#\\s]+", RegexOption.IGNORE_CASE)
    private val JWT_PATTERN = Regex("\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b")
    private val SECRET_TOKEN_PATTERN = Regex("\\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|cf_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_-]{20,}|\\d{8,10}:[A-Za-z0-9_-]{30,})\\b")
    private val ISO_DATE_PATTERN = Regex("\\b\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{2}:\\d{2}(?::\\d{2})?)?\\b")
    private val DATE_PLACEHOLDER_PATTERN = Regex("__BADBOY_DATE_(\\d+)__")
    @Volatile private var activeInstance: BadboyScreenReaderService? = null

    fun readCurrentScreen(ownPackage: String): String? =
      activeInstance?.readCurrentScreen(ownPackage)

    fun readOtherAppScreen(ownPackage: String): String? =
      activeInstance?.readOtherAppScreen(ownPackage)
  }
}
