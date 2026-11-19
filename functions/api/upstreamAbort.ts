export function createUpstreamAbortSignal(request: Request, timeoutMs = 30_000): {
  signal: AbortSignal;
  abort: (reason?: unknown) => void;
  wasTimedOut: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromClient = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abortFromClient();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Upstream request timed out"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    wasTimedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", abortFromClient);
    },
  };
}
