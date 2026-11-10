package expo.modules.badboywakeword

import kotlin.math.exp

/**
 * The exported Hey Badboy model emits a single logit, not a probability.
 * Always apply sigmoid, including when the logit happens to be between 0 and 1.
 */
internal object WakeWordOutput {
  fun logitToProbability(logit: Float): Float {
    require(logit.isFinite()) { "TFLite model returned a non-finite logit." }
    val value = logit.toDouble()
    val probability = if (value >= 0.0) {
      1.0 / (1.0 + exp(-value))
    } else {
      val exponential = exp(value)
      exponential / (1.0 + exponential)
    }
    return probability.toFloat()
  }
}
