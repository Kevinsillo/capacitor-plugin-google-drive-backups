package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.RemoteStorage
import dev.kevinillanas.plugins.googledrivebackups.core.domain.DRIVE_SPACE_MARGIN
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.hasEnoughSpace
import dev.kevinillanas.plugins.googledrivebackups.core.domain.quotaNearLimit
import dev.kevinillanas.plugins.googledrivebackups.core.domain.validateMetadata
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.storage.FolderZipper
import java.io.File

/**
 * Uploads a file, or a folder compressed first. Mirror of `UploadBackup` in TypeScript: same phases,
 * same events, same error codes. A folder is zipped into [tempDir] and that temporary zip is removed
 * afterwards, whatever the outcome.
 */
class UploadBackup(
    private val remote: RemoteStorage,
    private val emitter: EventSink,
    private val freeSpace: (File) -> Long,
    private val tempDir: File,
    private val zipper: FolderZipper = FolderZipper(),
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun execute(
        path: File,
        name: String,
        metadata: Map<String, String>,
        operationId: String,
        cancel: CancellationToken = CancellationToken(),
    ): RemoteBackup {
        val throttle = ProgressThrottle(emitter, operationId, clock)
        var temporaryZip: File? = null
        try {
            emitter.state(operationId, "preparing")
            validateMetadata(metadata)
            if (!path.exists()) throw ErrorBackup("file.001", mapOf("path" to path.path))

            emitter.state(operationId, "checking-space")
            val file = if (path.isDirectory) {
                emitter.state(operationId, "compressing")
                tempDir.mkdirs()
                val zip = File(tempDir, "$operationId.zip")
                temporaryZip = zip
                CompressFolder(zipper) { freeSpace(tempDir) }.execute(path, zip) { bytes, total ->
                    cancel.throwIfCancelled()
                    throttle.report(bytes, total)
                }
            } else {
                path
            }

            val size = file.length()
            if (size == 0L) throw ErrorBackup("file.003", mapOf("path" to file.path))

            val space = remote.space()
            val free = space.freeBytes
            if (free != null && !hasEnoughSpace(free, size, DRIVE_SPACE_MARGIN)) {
                throw ErrorBackup("space.002", mapOf("needed" to size, "free" to free))
            }
            val limit = space.limitBytes
            if (limit != null && free != null && quotaNearLimit(limit, free)) {
                emitter.warning("space.010", mapOf("limit" to limit, "free" to free), operationId)
            }

            cancel.throwIfCancelled()
            emitter.state(operationId, "uploading")
            val backup = remote.upload(name, file, metadata) { bytes, total ->
                cancel.throwIfCancelled()
                throttle.report(bytes, total)
            }

            emitter.state(operationId, "verifying")
            if (backup.bytes != size) {
                throw ErrorBackup(
                    "drive.001",
                    mapOf("reason" to "size-mismatch", "sent" to size, "received" to backup.bytes),
                )
            }

            emitter.state(operationId, "done")
            return backup
        } catch (failure: Throwable) {
            throw emitter.closeWithError(operationId, failure, cancel.cancelled)
        } finally {
            temporaryZip?.delete()
        }
    }
}
