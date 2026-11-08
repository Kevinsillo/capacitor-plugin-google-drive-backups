package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.auth

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup

/**
 * Holds the access token in memory only. Mirror of `GisAuth` in TypeScript: `auth.001` before any sign-in,
 * `auth.002` after expiry, and a one-minute margin so a request never starts with a dying token.
 */
class TokenSession(private val clock: () -> Long = System::currentTimeMillis) {
    private var value: String? = null
    private var expiresAt = 0L
    private var everSignedIn = false

    @Synchronized
    fun store(token: String, expiresInSeconds: Long) {
        value = token
        expiresAt = clock() + expiresInSeconds * 1000
        everSignedIn = true
    }

    /** The current token, or the error the caller must handle: `auth.001` or `auth.002`. */
    @Synchronized
    fun token(): String {
        val current = value ?: throw ErrorBackup(if (everSignedIn) "auth.002" else "auth.001")
        if (expiresAt - EXPIRY_MARGIN_MS <= clock()) {
            value = null
            throw ErrorBackup("auth.002")
        }
        return current
    }

    @Synchronized
    fun isConnected(): Boolean = value != null && expiresAt - EXPIRY_MARGIN_MS > clock()

    @Synchronized
    fun clear() {
        value = null
    }

    private companion object {
        const val EXPIRY_MARGIN_MS = 60_000L
    }
}
