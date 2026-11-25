export type FrameScheduler = (callback: () => void) => number;
export type FrameCanceller = (frame: number) => void;

/** Coalesces provider chunks into at most one UI update per animation frame. */
export function createStreamChunkBuffer(
  onFlush: (chunk: string) => void,
  scheduleFrame: FrameScheduler,
  cancelFrame: FrameCanceller,
) {
  let pending = '';
  let frame: number | null = null;

  const flushPending = () => {
    const chunk = pending;
    pending = '';
    if (chunk) onFlush(chunk);
  };

  return {
    push(chunk: string) {
      if (!chunk) return;
      pending += chunk;
      if (frame !== null) return;
      frame = scheduleFrame(() => {
        frame = null;
        flushPending();
      });
    },
    flush() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      flushPending();
    },
    cancel() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      pending = '';
    },
  };
}
