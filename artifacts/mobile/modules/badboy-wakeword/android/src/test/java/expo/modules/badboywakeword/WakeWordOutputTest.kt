package expo.modules.badboywakeword

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeWordOutputTest {
  @Test
  fun zeroLogitMapsToHalfProbability() {
    assertEquals(0.5f, WakeWordOutput.logitToProbability(0.0f), 0.000001f)
  }

  @Test
  fun logitBetweenZeroAndOneStillReceivesSigmoid() {
    assertEquals(0.62245935f, WakeWordOutput.logitToProbability(0.5f), 0.000001f)
  }

  @Test
  fun negativeLogitMapsBelowHalfProbability() {
    assertEquals(0.26894143f, WakeWordOutput.logitToProbability(-1.0f), 0.000001f)
  }

  @Test
  fun positiveLogitCanCrossConfiguredWakeThreshold() {
    assertTrue(WakeWordOutput.logitToProbability(1.0f) > 0.696f)
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsNonFiniteModelOutput() {
    WakeWordOutput.logitToProbability(Float.NaN)
  }
}
