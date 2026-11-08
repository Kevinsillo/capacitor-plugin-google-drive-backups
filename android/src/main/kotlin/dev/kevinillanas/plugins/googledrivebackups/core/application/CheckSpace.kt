package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.RemoteStorage
import dev.kevinillanas.plugins.googledrivebackups.core.domain.NEAR_QUOTA_THRESHOLD
import dev.kevinillanas.plugins.googledrivebackups.core.domain.quotaNearLimit
import java.io.File

/** Free space on the device and in Drive. Emits `space.010` as a warning if the quota is close. Mirror of `CheckSpace`. */
class CheckSpace(
    private val remote: RemoteStorage,
    private val localFreeSpace: (File) -> Long,
    private val emitter: EventSink,
    private val storageRoot: File,
) {
    fun execute(): Map<String, Any?> {
        val local = localFreeSpace(storageRoot)
        val drive = remote.space()
        val limit = drive.limitBytes
        val free = drive.freeBytes
        if (limit != null && free != null && quotaNearLimit(limit, free, NEAR_QUOTA_THRESHOLD)) {
            emitter.warning("space.010", mapOf("limit" to limit, "free" to free))
        }
        return mapOf("localFreeBytes" to local, "driveFreeBytes" to free, "driveLimitBytes" to limit)
    }
}
