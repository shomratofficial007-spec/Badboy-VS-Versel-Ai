import type { DeveloperEngineMode } from './types';

export type ActiveDeveloperEngine = 'native' | 'copilot';

export interface DeveloperEngineResolution {
  requestedEngine: DeveloperEngineMode;
  activeEngine: ActiveDeveloperEngine | null;
  status: 'ready' | 'fallback' | 'unavailable';
  reason?: string;
}

/**
 * Resolve only the Developer Agent engine. This never changes Chat or Voice routing.
 * Copilot remains unavailable until its isolated CLI runtime and auth are validated.
 */
export function resolveDeveloperEngine(
  requestedEngine: DeveloperEngineMode,
  copilotRuntimeAvailable = false,
): DeveloperEngineResolution {
  if (requestedEngine === 'native') {
    return { requestedEngine, activeEngine: 'native', status: 'ready' };
  }

  if (requestedEngine === 'copilot') {
    return copilotRuntimeAvailable
      ? { requestedEngine, activeEngine: 'copilot', status: 'ready' }
      : {
          requestedEngine,
          activeEngine: null,
          status: 'unavailable',
          reason: 'GitHub Copilot SDK এখনো চালু করা হয়নি। SDK-এর CLI runtime, নিরাপদ authentication এবং isolated runner যাচাই বাকি; GitHub connection পরবর্তী ধাপে করা হবে।',
        };
  }

  if (copilotRuntimeAvailable) {
    return { requestedEngine, activeEngine: 'copilot', status: 'ready' };
  }

  return {
    requestedEngine,
    activeEngine: 'native',
    status: 'fallback',
    reason: 'Copilot SDK runtime এখনো প্রস্তুত নয়; Auto / Hybrid স্বচ্ছভাবে Badboy Native engine ব্যবহার করছে। Task prompt ও context অক্ষত আছে।',
  };
}
