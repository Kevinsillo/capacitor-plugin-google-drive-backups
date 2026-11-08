package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup

/** Cooperative cancellation. Use cases check it between steps and inside the transfer callbacks. */
class CancellationToken {
    @Volatile
    var cancelled: Boolean = false
        private set

    fun cancel() {
        cancelled = true
    }

    fun throwIfCancelled() {
        if (cancelled) throw ErrorBackup("operation.001")
    }
}
