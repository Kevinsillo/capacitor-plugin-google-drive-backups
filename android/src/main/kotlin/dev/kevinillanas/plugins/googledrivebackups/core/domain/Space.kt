package dev.kevinillanas.plugins.googledrivebackups.core.domain

import java.util.Locale
import kotlin.math.ceil

/** Mirror of `src/core/domain/space.ts`. Same constants and same rules. */
const val LOCAL_SPACE_MARGIN = 1.1
const val DRIVE_SPACE_MARGIN = 1.0
const val NEAR_QUOTA_THRESHOLD = 0.9

/**
 * True if the free space covers the needed amount with the margin. The requirement is rounded to
 * whole bytes, as in TypeScript: `100 * 1.1` is `110.00000000000001` in floating point.
 */
fun hasEnoughSpace(free: Long, needed: Long, margin: Double): Boolean {
    val exact = String.format(Locale.ROOT, "%.6f", needed * margin).toDouble()
    val required = ceil(exact).toLong()
    return free >= required
}

/** True if the used part reaches the threshold of the limit. Unknown limit: no warning. */
fun quotaNearLimit(limit: Long, free: Long, threshold: Double = NEAR_QUOTA_THRESHOLD): Boolean {
    if (limit <= 0) return false
    val used = maxOf(limit - free, 0L)
    return used.toDouble() / limit >= threshold
}
