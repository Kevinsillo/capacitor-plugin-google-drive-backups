package dev.kevinillanas.plugins.googledrivebackups.core.domain

/**
 * Mirror of `ERROR_CODES` in `src/core/domain/errors.ts`: the recoverable flag for each code.
 * Keep both tables in step; the parity test in `ErrorCatalogTest` checks the codes used by the native side.
 */
object ErrorCatalog {
    private val recoverable: Map<String, Boolean> = mapOf(
        "auth.001" to true, "auth.002" to true, "auth.003" to true,
        "space.001" to true, "space.002" to true, "space.010" to true,
        "network.001" to true, "network.002" to true, "network.003" to true, "network.010" to true,
        "file.001" to false, "file.002" to false, "file.003" to false,
        "drive.001" to false, "drive.002" to false, "drive.003" to true,
        "operation.001" to false, "operation.002" to false,
        "metadata.001" to false,
        "platform.001" to false,
        "configuration.001" to false,
        "configuration.002" to false,
    )

    /** `true` if the app can retry or fix the cause. Unknown codes are not recoverable. */
    fun isRecoverable(code: String): Boolean = recoverable[code] ?: false

    /** Every code this catalog knows. */
    val codes: Set<String> get() = recoverable.keys
}
