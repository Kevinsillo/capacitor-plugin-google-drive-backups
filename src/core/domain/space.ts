/** Local margin when compressing: room is needed for both the zip and the original. */
export const LOCAL_SPACE_MARGIN = 1.1;

/** No margin: uploading to Drive writes nothing on the device. */
export const DRIVE_SPACE_MARGIN = 1;

/** Fraction of the Drive quota from which a `space.010` warning is emitted. */
export const NEAR_QUOTA_THRESHOLD = 0.9;

/**
 * True if the free space covers the required amount with the given margin.
 * The requirement is rounded to whole bytes: in floating point 100 × 1.1 is 110.00000000000001,
 * and without rounding 110 free bytes would not be enough.
 */
export function hasEnoughSpace(free: number, needed: number, margin: number): boolean {
  const required = Math.ceil(Number((needed * margin).toFixed(6)));
  return free >= required;
}

/** True if the used part reaches the threshold of the limit. Unknown limit: no warning. */
export function quotaNearLimit(limit: number, free: number, threshold: number = NEAR_QUOTA_THRESHOLD): boolean {
  if (limit <= 0) return false;
  const used = Math.max(limit - free, 0);
  return used / limit >= threshold;
}
