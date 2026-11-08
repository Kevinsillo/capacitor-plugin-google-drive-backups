package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive

import androidx.test.ext.junit.runners.AndroidJUnit4
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Real HTTP round trip through HttpURLConnection against a local MockWebServer. Runs on a device or emulator
 * (`androidTest`), because the Android unit-test classpath has no JDK HTTP server.
 */
@RunWith(AndroidJUnit4::class)
class HttpUrlTransportTest {

    private lateinit var server: MockWebServer

    @Before
    fun start() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stop() {
        server.shutdown()
    }

    @Test
    fun streamsTheBody_withFixedLength_andReturnsStatusAndBody() {
        server.enqueue(MockResponse().setResponseCode(201).setBody("ok"))
        val payload = "hello streamed world"
        val request = HttpRequest(
            method = "POST",
            url = server.url("/echo").toString(),
            headers = mapOf("Authorization" to "Bearer T"),
            body = RequestBody("text/plain", payload.length.toLong()) { it.write(payload.toByteArray()) },
        )

        val response = HttpUrlTransport().send(request)
        val text = response.use { it.body.readBytes().toString(Charsets.UTF_8) }

        assertEquals(201, response.status)
        assertEquals("ok", text)
        val received = server.takeRequest()
        assertEquals("POST", received.method)
        assertEquals("Bearer T", received.getHeader("Authorization"))
        assertEquals(payload, received.body.readUtf8())
        assertTrue(received.getHeader("Content-Type")!!.startsWith("text/plain"))
    }
}
