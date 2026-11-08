/** Minimum interval between two `progress` events of the same operation. */
export const PROGRESS_INTERVAL_MS = 250;

/**
 * Decides whether a `progress` event is due. The first one is always emitted;
 * after that, only once the interval has elapsed since the last emission.
 */
export function shouldEmitProgress(
  lastMs: number | undefined,
  nowMs: number,
  interval: number = PROGRESS_INTERVAL_MS,
): boolean {
  return lastMs === undefined || nowMs - lastMs >= interval;
}
