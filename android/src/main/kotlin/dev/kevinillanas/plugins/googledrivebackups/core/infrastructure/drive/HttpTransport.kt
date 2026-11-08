package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive

import java.io.Closeable
import java.io.InputStream
import java.io.OutputStream

/** Request body written in one pass. [length] must match the bytes that [write] produces. */
class RequestBody(
    val contentType: String,
    val length: Long,
    val write: (OutputStream) -> Unit,
)

class HttpRequest(
    val method: String,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: RequestBody? = null,
)

/** Response with the body still unread. The caller must close it. */
class HttpResponse(
    val status: Int,
    val body: InputStream,
    private val onClose: () -> Unit = {},
) : Closeable {
    override fun close() {
        body.close()
        onClose()
    }
}

/** HTTP port of the Drive client. The Android implementation is [HttpUrlTransport]. */
interface HttpTransport {
    /** Sends the request. Throws `java.io.IOException` for network failures. */
    fun send(request: HttpRequest): HttpResponse
}
