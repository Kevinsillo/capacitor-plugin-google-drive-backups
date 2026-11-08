package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.RemoteStorage
import dev.kevinillanas.plugins.googledrivebackups.core.domain.DriveSpace
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import java.io.File

/** Records every event in order, so tests can check phases and payloads. */
class RecordingSink : EventSink {
    val events = mutableListOf<Pair<String, Map<String, Any?>>>()

    override fun emit(event: String, data: Map<String, Any?>) {
        events += event to data
    }

    /** Phase names in order, like `state:uploading`, plus the other event names. */
    fun names(): List<String> = events.map { (name, data) ->
        if (name == "state") "state:${data["phase"]}" else name
    }

    fun of(event: String): List<Map<String, Any?>> = events.filter { it.first == event }.map { it.second }
}

/**
 * In-memory remote storage. Uploads keep the byte count the caller sent; [returnedUploadBytes] lets a test
 * simulate a server that stores a different size. Downloads write the stored bytes to the destination.
 */
class FakeRemoteStorage(
    var space: DriveSpace = DriveSpace(null, null),
    var returnedUploadBytes: Long? = null,
) : RemoteStorage {
    val uploads = mutableListOf<Pair<String, Map<String, String>>>()
    var deletes = 0
    private val stored = mutableMapOf<String, ByteArray>()
    private var nextId = 1

    /** Runs before the upload body is consumed. Tests use it to trigger cancellation. */
    var beforeUpload: () -> Unit = {}

    override fun space(): DriveSpace = space

    override fun upload(
        name: String,
        content: File,
        metadata: Map<String, String>,
        onProgress: (bytes: Long, total: Long) -> Unit,
    ): RemoteBackup {
        beforeUpload()
        val bytes = content.readBytes()
        onProgress(bytes.size.toLong(), bytes.size.toLong())
        uploads += name to metadata
        val id = "F${nextId++}"
        stored[id] = bytes
        return RemoteBackup(id, name, returnedUploadBytes ?: bytes.size.toLong(), "2026-11-08T00:00:00.000Z", metadata)
    }

    override fun list(): List<RemoteBackup> = emptyList()

    override fun download(id: String, destination: File, onProgress: (bytes: Long, total: Long) -> Unit): Long {
        val bytes = stored[id] ?: throw IllegalStateException("no backup $id")
        destination.writeBytes(bytes)
        onProgress(bytes.size.toLong(), bytes.size.toLong())
        return bytes.size.toLong()
    }

    override fun delete(id: String) {
        deletes++
        stored.remove(id)
    }

    fun put(id: String, bytes: ByteArray) {
        stored[id] = bytes
    }
}
