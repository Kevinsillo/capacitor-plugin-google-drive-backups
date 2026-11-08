package dev.kevinillanas.plugins.googledrivebackups.core.domain

/**
 * Maps a Drive error response to a catalog code. Mirror of `translateDriveError` in TypeScript.
 * The cases are shared with TypeScript through `tests/fixtures/drive-errors.json`.
 */
fun translateDriveError(status: Int, reason: String?): ErrorBackup = when {
    status == 401 -> ErrorBackup("auth.002", mapOf("status" to status))
    status == 404 -> ErrorBackup("drive.002", mapOf("status" to status))
    status == 429 -> ErrorBackup("drive.003", mapOf("status" to status))
    status >= 500 -> ErrorBackup("network.003", mapOf("status" to status))
    status == 403 && reason == "storageQuotaExceeded" ->
        ErrorBackup("space.002", mapOf("status" to status, "reason" to reason))
    status == 403 && (reason == "rateLimitExceeded" || reason == "userRateLimitExceeded") ->
        ErrorBackup("drive.003", mapOf("status" to status, "reason" to reason))
    else -> ErrorBackup("drive.001", mapOf("status" to status, "reason" to (reason ?: "unknown")))
}

/** Errors retried with exponential delay. Mirror of `isRetryable` in TypeScript. */
fun isRetryable(status: Int, reason: String?): Boolean =
    status == 429 || status >= 500 ||
        (status == 403 && (reason == "rateLimitExceeded" || reason == "userRateLimitExceeded"))
