package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.domain.shouldEmitProgress

/** Throttles `progress` events to one per interval, always letting the final value through. */
class ProgressThrottle(
    private val emitter: EventSink,
    private val operationId: String,
    private val clock: () -> Long,
) {
    private var last: Long? = null

    fun report(bytes: Long, total: Long) {
        val now = clock()
        if (bytes < total && !shouldEmitProgress(last, now)) return
        last = now
        emitter.emit("progress", mapOf("operationId" to operationId, "bytes" to bytes, "total" to total))
    }
}
