package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.RemoteStorage
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.LOCAL_SPACE_MARGIN
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.hasEnoughSpace
import java.io.File

/**
 * Downloads a backup to [destination]. Mirror of `DownloadBackup`. The bytes are written straight to the
 * destination and the size is verified afterwards; a partial or mismatched file is deleted. The TypeScript
 * version verifies before writing, because it holds the bytes in memory.
 */
class DownloadBackup(
    private val remote: RemoteStorage,
    private val emitter: EventSink,
    private val freeSpace: (File) -> Long,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun execute(
        backup: RemoteBackup,
        destination: File,
        operationId: String,
        cancel: CancellationToken = CancellationToken(),
    ): Map<String, Any?> {
        val throttle = ProgressThrottle(emitter, operationId, clock)
        var finished = false
        try {
            emitter.state(operationId, "preparing")
            emitter.state(operationId, "checking-space")
            val free = freeSpace(destination.absoluteFile.parentFile ?: destination.absoluteFile)
            if (!hasEnoughSpace(free, backup.bytes, LOCAL_SPACE_MARGIN)) {
                throw ErrorBackup("space.001", mapOf("needed" to backup.bytes, "free" to free))
            }

            emitter.state(operationId, "downloading")
            val written = remote.download(backup.id, destination) { bytes, total ->
                cancel.throwIfCancelled()
                throttle.report(bytes, total)
            }

            emitter.state(operationId, "verifying")
            if (written != backup.bytes) {
                throw ErrorBackup(
                    "drive.001",
                    mapOf("reason" to "size-mismatch", "expected" to backup.bytes, "received" to written),
                )
            }

            emitter.state(operationId, "done")
            finished = true
            return mapOf("operationId" to operationId, "path" to destination.path, "bytes" to written)
        } catch (failure: Throwable) {
            throw emitter.closeWithError(operationId, failure, cancel.cancelled)
        } finally {
            if (!finished) destination.delete()
        }
    }
}
