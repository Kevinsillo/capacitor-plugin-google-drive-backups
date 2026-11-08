package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive

import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * [HttpTransport] built on the platform's `HttpURLConnection`, so it needs no extra dependency.
 * The request body is streamed with a fixed length, so large files do not sit in memory.
 */
class HttpUrlTransport(
    private val connectTimeoutMs: Int = 15_000,
    private val readTimeoutMs: Int = 60_000,
) : HttpTransport {

    override fun send(request: HttpRequest): HttpResponse {
        val connection = (URL(request.url).openConnection() as HttpURLConnection).apply {
            requestMethod = request.method
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            request.headers.forEach { (name, value) -> setRequestProperty(name, value) }
        }

        request.body?.let { body ->
            connection.doOutput = true
            connection.setFixedLengthStreamingMode(body.length)
            connection.setRequestProperty("Content-Type", body.contentType)
            connection.outputStream.use(body.write)
        }

        val status = connection.responseCode
        val stream = if (status < HTTP_BAD_REQUEST) connection.inputStream else connection.errorStream
        return HttpResponse(status, stream ?: ByteArrayInputStream(ByteArray(0))) { connection.disconnect() }
    }

    private companion object {
        const val HTTP_BAD_REQUEST = 400
    }
}
