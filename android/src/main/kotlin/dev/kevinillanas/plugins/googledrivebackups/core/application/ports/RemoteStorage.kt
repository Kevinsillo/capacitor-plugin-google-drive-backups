package dev.kevinillanas.plugins.googledrivebackups.core.application.ports

import dev.kevinillanas.plugins.googledrivebackups.core.domain.DriveSpace
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import java.io.File

/** Port for remote storage. The Drive client implements it; the use cases only see this interface. */
interface RemoteStorage {
    fun space(): DriveSpace
    fun upload(
        name: String,
        content: File,
        metadata: Map<String, String>,
        onProgress: (bytes: Long, total: Long) -> Unit = { _, _ -> },
    ): RemoteBackup
    fun list(): List<RemoteBackup>
    fun download(id: String, destination: File, onProgress: (bytes: Long, total: Long) -> Unit = { _, _ -> }): Long
    fun delete(id: String)
}
