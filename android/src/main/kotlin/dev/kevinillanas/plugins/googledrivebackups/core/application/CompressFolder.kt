package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.LOCAL_SPACE_MARGIN
import dev.kevinillanas.plugins.googledrivebackups.core.domain.hasEnoughSpace
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.storage.FolderZipper
import java.io.File

/**
 * Compresses a folder into a zip, but only after checking that the device has room for it.
 * The check runs before anything is written, so a failure leaves no partial file behind.
 * [freeSpace] returns the free bytes of the device; it is injected so the check can be tested,
 * and the Android adapter (`StatFs`) provides it on the device.
 */
class CompressFolder(
    private val zipper: FolderZipper,
    private val freeSpace: () -> Long,
) {
    /** Returns [target]. Throws `file.001`, `file.003` or `space.001`. */
    fun execute(folder: File, target: File, onProgress: (bytes: Long, total: Long) -> Unit = { _, _ -> }): File {
        val needed = zipper.estimateBytes(folder)
        if (needed == 0L) throw ErrorBackup("file.003", mapOf("path" to folder.path))

        val free = freeSpace()
        if (!hasEnoughSpace(free, needed, LOCAL_SPACE_MARGIN)) {
            throw ErrorBackup("space.001", mapOf("needed" to needed, "free" to free))
        }

        zipper.zip(folder, target, onProgress)
        return target
    }
}
