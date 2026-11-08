package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorCatalog

/** Emits a `state` event for an operation. */
fun EventSink.state(operationId: String, phase: String) =
    emit("state", mapOf("operationId" to operationId, "phase" to phase))

/** Emits a `warning` event. */
fun EventSink.warning(code: String, parameters: Map<String, Any?>, operationId: String? = null) =
    emit("warning", mapOf("operationId" to operationId, "code" to code, "parameters" to parameters))

/**
 * Converts any failure to an [ErrorBackup], emits the `error` event (preceded by `state: cancelled`
 * for a cancellation) and returns the error the use case must throw. Mirror of `closeWithError`.
 */
fun EventSink.closeWithError(operationId: String, failure: Throwable, cancelled: Boolean): ErrorBackup {
    val error = when {
        cancelled -> ErrorBackup("operation.001")
        failure is ErrorBackup -> failure
        else -> ErrorBackup("drive.001", mapOf("reason" to "unexpected"), failure.message ?: failure.toString())
    }
    if (cancelled) state(operationId, "cancelled")
    emit(
        "error",
        mapOf(
            "operationId" to operationId,
            "code" to error.code,
            "parameters" to error.parameters,
            "message" to (error.message ?: error.code),
            "recoverable" to ErrorCatalog.isRecoverable(error.code),
        ),
    )
    return error
}
