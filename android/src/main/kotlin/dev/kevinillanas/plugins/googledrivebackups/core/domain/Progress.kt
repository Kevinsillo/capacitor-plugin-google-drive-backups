package dev.kevinillanas.plugins.googledrivebackups.core.domain

/** Mirror of `src/core/domain/progress.ts`. */
const val PROGRESS_INTERVAL_MS = 250L

/** The first event always passes; after that, at least `interval` milliseconds apart. */
fun shouldEmitProgress(lastMs: Long?, nowMs: Long, interval: Long = PROGRESS_INTERVAL_MS): Boolean =
    lastMs == null || nowMs - lastMs >= interval
