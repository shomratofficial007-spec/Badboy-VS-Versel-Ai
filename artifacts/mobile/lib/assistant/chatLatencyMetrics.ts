export interface ChatLatencyMetric {
  event: 'first_ui_update' | 'response_complete';
  firstUiUpdateMs?: number | null;
  totalResponseMs?: number;
}

export function createChatLatencyTracker(
  startedAt: number,
  emit: (metric: ChatLatencyMetric) => void,
  now: () => number = Date.now,
) {
  let firstUiUpdateMs: number | null = null;

  return {
    markFirstUiUpdate(): number {
      if (firstUiUpdateMs === null) {
        firstUiUpdateMs = Math.max(0, now() - startedAt);
        emit({ event: 'first_ui_update', firstUiUpdateMs });
      }
      return firstUiUpdateMs;
    },
    markComplete(): void {
      emit({
        event: 'response_complete',
        totalResponseMs: Math.max(0, now() - startedAt),
        firstUiUpdateMs,
      });
    },
  };
}
