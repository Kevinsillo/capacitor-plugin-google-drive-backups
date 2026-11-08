package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URLDecoder

/** Transport double: returns prepared responses in order and records every request. */
private class FakeTransport(private val responses: MutableList<HttpResponse>) : HttpTransport {
    val requests = mutableListOf<HttpRequest>()

    override fun send(request: HttpRequest): HttpResponse {
        requests += request
        return responses.removeAt(0)
    }
}

private fun json(status: Int, body: String) = HttpResponse(status, ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)))

private fun driveError(status: Int, reason: String? = null) = json(
    status,
    if (reason == null) """{"error":{"code":$status,"errors":[]}}"""
    else """{"error":{"code":$status,"errors":[{"reason":"$reason"}]}}""",
)

private fun bodyText(request: HttpRequest): String {
    val out = ByteArrayOutputStream()
    request.body!!.write(out)
    return out.toString(Charsets.UTF_8.name())
}

class DriveRestClientTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun client(
        transport: HttpTransport,
        waits: MutableList<Long> = mutableListOf(),
        token: () -> String = { "TOKEN" },
        location: String = "appDataFolder",
    ) = DriveRestClient(
        transport = transport,
        token = token,
        storageLocation = location,
        wait = { waits += it },
    )

    private fun errorOf(block: () -> Unit): ErrorBackup =
        assertThrows(ErrorBackup::class.java) { block() }

    @Test
    fun space_computesFreeFromLimitAndUsage() {
        val transport = FakeTransport(mutableListOf(json(200, """{"storageQuota":{"limit":"1000","usage":"400"}}""")))
        val space = client(transport).space()
        assertEquals(1000L, space.limitBytes)
        assertEquals(600L, space.freeBytes)
        assertTrue(transport.requests[0].url.contains("about?fields=storageQuota"))
    }

    @Test
    fun space_withoutLimit_reportsNulls() {
        val space = client(FakeTransport(mutableListOf(json(200, """{"storageQuota":{"usage":"400"}}""")))).space()
        assertNull(space.limitBytes)
        assertNull(space.freeBytes)
    }

    @Test
    fun upload_sendsMultipartWithMetadataAndFileBytes_andReportsProgressToTotal() {
        val file = tmp.newFile("backup.zip").apply { writeBytes(ByteArray(150 * 1024) { 7 }) }
        val transport = FakeTransport(
            mutableListOf(json(200, """{"id":"F1","name":"backup.zip","size":"153600","createdTime":"2026-11-08T09:00:00.000Z","appProperties":{"version":"3"}}""")),
        )
        val progress = mutableListOf<Pair<Long, Long>>()

        val backup = client(transport).upload("backup.zip", file, mapOf("version" to "3")) { bytes, total ->
            progress += bytes to total
        }

        val request = transport.requests.single()
        assertEquals("POST", request.method)
        assertEquals("Bearer TOKEN", request.headers["Authorization"])
        assertTrue(request.url.contains("upload/drive/v3/files?uploadType=multipart"))
        val body = bodyText(request)
        assertTrue(body.contains("\"name\":\"backup.zip\""))
        assertTrue(body.contains("\"appProperties\":{\"version\":\"3\"}"))
        assertTrue(body.contains("\"parents\":[\"appDataFolder\"]"))
        assertEquals(request.body!!.length, bodyText(request).toByteArray(Charsets.UTF_8).size.toLong())

        assertEquals(150L * 1024, progress.last().first)
        assertEquals(150L * 1024, progress.last().second)
        assertEquals("F1", backup.id)
        assertEquals(153600L, backup.bytes)
        assertEquals(mapOf("version" to "3"), backup.metadata)
    }

    @Test
    fun upload_invalidMetadata_failsBeforeAnyRequest() {
        val file = tmp.newFile("x.zip").apply { writeText("x") }
        val transport = FakeTransport(mutableListOf())
        val error = errorOf { client(transport).upload("x", file, mapOf("big" to "x".repeat(200))) }
        assertEquals("metadata.001", error.code)
        assertTrue(transport.requests.isEmpty())
    }

    @Test
    fun upload_missingFile_isFile001_withoutRequest() {
        val transport = FakeTransport(mutableListOf())
        val error = errorOf { client(transport).upload("x", File(tmp.root, "nope.zip"), emptyMap()) }
        assertEquals("file.001", error.code)
        assertTrue(transport.requests.isEmpty())
    }

    @Test
    fun retriesA429_withExponentialDelay_thenSucceeds() {
        val waits = mutableListOf<Long>()
        val transport = FakeTransport(mutableListOf(driveError(429), json(200, """{"storageQuota":{"limit":"10","usage":"0"}}""")))
        assertEquals(10L, client(transport, waits).space().freeBytes)
        assertEquals(2, transport.requests.size)
        assertEquals(listOf(500L), waits)
    }

    @Test
    fun exhaustsRetriesOn503_andReportsNetwork003() {
        val waits = mutableListOf<Long>()
        val transport = FakeTransport(mutableListOf(driveError(503), driveError(503), driveError(503), driveError(503)))
        val error = errorOf { client(transport, waits).space() }
        assertEquals("network.003", error.code)
        assertEquals(4, transport.requests.size) // 1 attempt + 3 retries
        assertEquals(listOf(500L, 1000L, 2000L), waits)
    }

    @Test
    fun storageQuotaExceeded_isSpace002_andNotRetried() {
        val tmpFile = tmp.newFile("y.zip").apply { writeText("y") }
        val transport = FakeTransport(mutableListOf(driveError(403, "storageQuotaExceeded")))
        val error = errorOf { client(transport).upload("y", tmpFile, emptyMap()) }
        assertEquals("space.002", error.code)
        assertEquals(1, transport.requests.size)
    }

    @Test
    fun tokenFailure_propagates_withoutCallingTheNetwork() {
        val transport = FakeTransport(mutableListOf())
        val error = errorOf { client(transport, token = { throw ErrorBackup("auth.001") }).space() }
        assertEquals("auth.001", error.code)
        assertTrue(transport.requests.isEmpty())
    }

    @Test
    fun list_followsPages_andKeepsOrder() {
        val transport = FakeTransport(
            mutableListOf(
                json(200, """{"nextPageToken":"P2","files":[{"id":"A","name":"a.zip","size":"10","createdTime":"2026-02-01T00:00:00.000Z"}]}"""),
                json(200, """{"files":[{"id":"B","name":"b.zip","size":"20","createdTime":"2026-01-01T00:00:00.000Z","appProperties":{"v":"1"}}]}"""),
            ),
        )
        val backups = client(transport).list()
        assertEquals(listOf("A", "B"), backups.map { it.id })
        assertTrue(transport.requests[0].url.contains("spaces=appDataFolder"))
        assertTrue(transport.requests[1].url.contains("pageToken=P2"))
        assertEquals(mapOf("v" to "1"), backups[1].metadata)
    }

    @Test
    fun download_streamsBytesToDestination() {
        val destination = File(tmp.root, "out.zip")
        val transport = FakeTransport(mutableListOf(json(200, "abcd")))
        val written = client(transport).download("F1", destination)
        assertEquals(4L, written)
        assertArrayEquals("abcd".toByteArray(), destination.readBytes())
        assertTrue(transport.requests[0].url.endsWith("/files/F1?alt=media"))
    }

    @Test
    fun delete_404_isDrive002() {
        val transport = FakeTransport(mutableListOf(driveError(404)))
        assertEquals("drive.002", errorOf { client(transport).delete("X") }.code)
        assertEquals("DELETE", transport.requests[0].method)
    }

    @Test
    fun folder_isCreatedWhenMissing_andBecomesTheUploadParent() {
        val file = tmp.newFile("backup.zip").apply { writeBytes(ByteArray(10) { 1 }) }
        val transport = FakeTransport(
            mutableListOf(
                json(200, """{"files":[]}"""),
                json(200, """{"id":"FOLDER"}"""),
                json(200, """{"id":"F1","name":"backup.zip","size":"10","createdTime":"2026-11-08T09:00:00.000Z"}"""),
            ),
        )
        folderClient(transport).upload("backup.zip", file, emptyMap()) { _, _ -> }

        assertEquals("GET", transport.requests[0].method)
        assertEquals("POST", transport.requests[1].method)
        assertTrue(bodyText(transport.requests[1]).contains(""""name":"dev.kevinillanas.diary""""))
        assertTrue(bodyText(transport.requests[1]).contains(""""mimeType":"application/vnd.google-apps.folder""""))
        assertTrue(bodyText(transport.requests[1]).contains(""""parents":["root"]"""))
        assertTrue(bodyText(transport.requests[2]).contains(""""parents":["FOLDER"]"""))
    }

    @Test
    fun folder_isFoundAndCachedBetweenOperations_andListOnlyItsBackups() {
        val transport = FakeTransport(
            mutableListOf(
                json(200, """{"files":[{"id":"FOLDER"}]}"""),
                json(200, """{"files":[]}"""),
                json(200, """{"files":[]}"""),
            ),
        )
        val client = folderClient(transport)
        client.list()
        client.list()

        assertEquals(3, transport.requests.size)
        val query = URLDecoder.decode(transport.requests[1].url, "UTF-8")
        assertTrue(query.contains("'FOLDER' in parents"))
        assertTrue(query.contains("mimeType != 'application/vnd.google-apps.folder'"))
    }

    @Test
    fun folder_nameQuotesAreEscapedInTheSearch() {
        val transport = FakeTransport(mutableListOf(json(200, """{"files":[{"id":"FOLDER"}]}"""), json(200, """{"files":[]}""")))
        folderClient(transport, folder = "o'brien").list()
        assertTrue(URLDecoder.decode(transport.requests[0].url, "UTF-8").contains("name = 'o\\'brien'"))
    }

    private fun folderClient(
        transport: HttpTransport,
        location: String = "drive",
        folder: String = "dev.kevinillanas.diary",
    ) = DriveRestClient(
        transport = transport,
        token = { "TOKEN" },
        storageLocation = location,
        folderName = folder,
        wait = {},
    )
}
