package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.RemoteStorage
import dev.kevinillanas.plugins.googledrivebackups.core.domain.DriveSpace
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.isRetryable
import dev.kevinillanas.plugins.googledrivebackups.core.domain.translateDriveError
import dev.kevinillanas.plugins.googledrivebackups.core.domain.validateMetadata
import java.io.File
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.Random

/**
 * Drive v3 REST client for Android. Mirror of `DriveRestClient` in TypeScript: same endpoints, same
 * retry policy, same error mapping (shared fixtures), and the same metadata checks before any request.
 *
 * [storageLocation] is `appDataFolder` (private to the app) or `drive`. [folderName] is the parent folder
 * for the backups: the client finds it or creates it, once per instance. Null means no folder: backups go
 * to the root of the storage location. [token] returns a valid access token and throws `auth.001` or
 * `auth.002` when there is none. [wait] is injectable so tests do not sleep.
 */
class DriveRestClient(
    private val transport: HttpTransport,
    private val token: () -> String,
    private val storageLocation: String,
    private val folderName: String? = null,
    private val apiBase: String = "https://www.googleapis.com/drive/v3",
    private val uploadBase: String = "https://www.googleapis.com/upload/drive/v3",
    private val maxRetries: Int = 3,
    private val wait: (Long) -> Unit = { Thread.sleep(it) },
) : RemoteStorage {

    private var folderId: String? = null

    /** Drive quota. Returns nulls when the account reports no limit. */
    override fun space(): DriveSpace {
        val quota = readJson(send(HttpRequest("GET", "$apiBase/about?fields=storageQuota"))).getAsJsonObject("storageQuota")
        val limit = quota?.get("limit")?.asString?.toLong() ?: return DriveSpace(null, null)
        val used = quota.get("usage")?.asString?.toLong() ?: 0L
        return DriveSpace(limit, maxOf(limit - used, 0L))
    }

    /**
     * Uploads [content] as a multipart request, streamed from disk. [onProgress] receives bytes sent and
     * the total. After a retry the progress starts again from zero, because the body is written again.
     */
    override fun upload(
        name: String,
        content: File,
        metadata: Map<String, String>,
        onProgress: (bytes: Long, total: Long) -> Unit,
    ): RemoteBackup {
        validateMetadata(metadata)
        if (!content.isFile) throw ErrorBackup("file.001", mapOf("path" to content.path))
        if (content.length() == 0L) throw ErrorBackup("file.003", mapOf("path" to content.path))

        val parent = parentId()
        val boundary = "gdb${Random().nextLong().toULong()}"
        val resource = JsonObject().apply {
            addProperty("name", name)
            add("appProperties", JsonObject().apply { metadata.forEach { (k, v) -> addProperty(k, v) } })
            parent?.let { add("parents", JsonArray().apply { add(it) }) }
        }
        val head = (
            "--$boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
                "$resource\r\n--$boundary\r\nContent-Type: application/octet-stream\r\n\r\n"
            ).toByteArray(Charsets.UTF_8)
        val tail = "\r\n--$boundary--".toByteArray(Charsets.UTF_8)
        val total = content.length()

        val body = RequestBody(
            contentType = "multipart/related; boundary=$boundary",
            length = head.size + total + tail.size,
        ) { out ->
            out.write(head)
            var done = 0L
            val buffer = ByteArray(BUFFER_SIZE)
            content.inputStream().use { input ->
                while (true) {
                    val read = input.read(buffer)
                    if (read == -1) break
                    out.write(buffer, 0, read)
                    done += read
                    onProgress(done, total)
                }
            }
            out.write(tail)
        }

        val response = send(
            HttpRequest(
                "POST",
                "$uploadBase/files?uploadType=multipart&fields=$FILE_FIELDS",
                body = body,
            ),
        )
        return toBackup(readJson(response))
    }

    /** Backups ordered by creation date, newest first. Follows every page. */
    override fun list(): List<RemoteBackup> {
        val backups = mutableListOf<RemoteBackup>()
        // With a folder, only the backups inside it: the folder itself is not a backup.
        val filter = if (folderName == null) {
            "trashed = false"
        } else {
            "trashed = false and mimeType != '$FOLDER_MIME' and '${parentId()}' in parents"
        }
        var nextPage: String? = null
        do {
            val query = buildString {
                append("spaces=").append(storageLocation)
                append("&q=").append(encode(filter))
                append("&orderBy=").append(encode("createdTime desc"))
                append("&pageSize=100&fields=").append(encode("nextPageToken,files($FILE_FIELDS)"))
                nextPage?.let { append("&pageToken=").append(encode(it)) }
            }
            val page = readJson(send(HttpRequest("GET", "$apiBase/files?$query")))
            page.getAsJsonArray("files")?.forEach { backups += toBackup(it.asJsonObject) }
            nextPage = page.get("nextPageToken")?.asString
        } while (nextPage != null)
        return backups
    }

    /** Streams the backup into [destination] and returns the bytes written. */
    override fun download(
        id: String,
        destination: File,
        onProgress: (bytes: Long, total: Long) -> Unit,
    ): Long {
        val response = send(HttpRequest("GET", "$apiBase/files/${encode(id)}?alt=media"))
        var done = 0L
        response.use { http ->
            destination.outputStream().use { out ->
                val buffer = ByteArray(BUFFER_SIZE)
                while (true) {
                    val read = http.body.read(buffer)
                    if (read == -1) break
                    out.write(buffer, 0, read)
                    done += read
                    onProgress(done, done)
                }
            }
        }
        return done
    }

    /** Email of the signed-in account, or null if Drive does not report it. */
    fun accountEmail(): String? {
        val user = readJson(send(HttpRequest("GET", "$apiBase/about?fields=user(emailAddress)"))).getAsJsonObject("user")
        return user?.get("emailAddress")?.asString
    }

    /** Deletes a backup. Rejects with `drive.002` if it does not exist. */
    override fun delete(id: String) {
        send(HttpRequest("DELETE", "$apiBase/files/${encode(id)}")).close()
    }

    /**
     * Id of the folder that holds the backups, or null for the root. Without [folderName] the root is
     * `appDataFolder` in that storage and nothing in `drive`. Found or created once, then cached.
     */
    @Synchronized
    private fun parentId(): String? {
        val name = folderName ?: return rootId().takeIf { storageLocation == "appDataFolder" }
        folderId?.let { return it }
        return findOrCreateFolder(name).also { folderId = it }
    }

    /** The oldest folder with that name under the root, or a new one. Older duplicates are never touched. */
    private fun findOrCreateFolder(name: String): String {
        val root = rootId()
        val query = "name = '${escapeQuery(name)}' and mimeType = '$FOLDER_MIME' and '$root' in parents and trashed = false"
        val search = "$apiBase/files?spaces=$storageLocation&q=${encode(query)}&orderBy=createdTime&pageSize=1&fields=files(id)"
        readJson(send(HttpRequest("GET", search))).getAsJsonArray("files")
            ?.firstOrNull()?.let { return it.asJsonObject.get("id").asString }

        val resource = JsonObject().apply {
            addProperty("name", name)
            addProperty("mimeType", FOLDER_MIME)
            add("parents", JsonArray().apply { add(root) })
        }.toString().toByteArray(Charsets.UTF_8)
        val body = RequestBody(contentType = "application/json; charset=UTF-8", length = resource.size.toLong()) {
            it.write(resource)
        }
        val created = send(HttpRequest("POST", "$apiBase/files?fields=id", body = body))
        return readJson(created).get("id").asString
    }

    private fun rootId(): String = if (storageLocation == "appDataFolder") "appDataFolder" else "root"

    private fun escapeQuery(value: String): String = value.replace("\\", "\\\\").replace("'", "\\'")

    /**
     * The only way out to the network. Adds the token, retries retryable errors with exponential delay
     * (500 ms, 1 s, 2 s), and translates the rest to the catalog. Returns the response with its body unread.
     */
    private fun send(request: HttpRequest): HttpResponse {
        var attempt = 0
        while (true) {
            val authorized = HttpRequest(
                method = request.method,
                url = request.url,
                headers = request.headers + ("Authorization" to "Bearer ${token()}"),
                body = request.body,
            )
            val response = try {
                transport.send(authorized)
            } catch (error: SocketTimeoutException) {
                throw ErrorBackup("network.002")
            } catch (error: IOException) {
                throw ErrorBackup("network.001", mapOf("cause" to (error.javaClass.simpleName)))
            }

            if (response.status in 200..299) return response

            val reason = reasonOf(response)
            if (isRetryable(response.status, reason) && attempt < maxRetries) {
                wait(500L shl attempt)
                attempt++
                continue
            }
            throw translateDriveError(response.status, reason)
        }
    }

    private fun reasonOf(response: HttpResponse): String? = response.use {
        val text = it.body.bufferedReader(Charsets.UTF_8).use { reader -> reader.readText() }
        try {
            JsonParser.parseString(text).asJsonObject
                .getAsJsonObject("error")
                ?.getAsJsonArray("errors")
                ?.firstOrNull()
                ?.asJsonObject
                ?.get("reason")
                ?.asString
        } catch (_: RuntimeException) {
            null
        }
    }

    private fun readJson(response: HttpResponse): JsonObject = response.use {
        val text = it.body.bufferedReader(Charsets.UTF_8).use { reader -> reader.readText() }
        JsonParser.parseString(text).asJsonObject
    }

    private fun toBackup(file: JsonObject): RemoteBackup {
        val metadata = file.getAsJsonObject("appProperties")?.entrySet()
            ?.associate { it.key to it.value.asString } ?: emptyMap()
        return RemoteBackup(
            id = file.get("id").asString,
            name = file.get("name").asString,
            bytes = file.get("size")?.asString?.toLong() ?: 0L,
            createdAt = file.get("createdTime").asString,
            metadata = metadata,
        )
    }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name())

    private companion object {
        const val FILE_FIELDS = "id,name,size,createdTime,appProperties"
        const val FOLDER_MIME = "application/vnd.google-apps.folder"
        const val BUFFER_SIZE = 64 * 1024
    }
}
