package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.domain.DriveSpace
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class UploadBackupTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val sink = RecordingSink()
    private val remote = FakeRemoteStorage()
    private var clock = 0L

    private fun useCase() = UploadBackup(
        remote = remote,
        emitter = sink,
        freeSpace = { 1_000_000L },
        tempDir = tmp.newFolder("tmp"),
        clock = { clock },
    )

    private fun file(bytes: Int = 4): File = tmp.newFile("backup.zip").apply { writeBytes(ByteArray(bytes) { 1 }) }

    private fun errorOf(block: () -> Unit): ErrorBackup = assertThrows(ErrorBackup::class.java) { block() }

    @Test
    fun uploadsAFile_withTheExpectedPhases_andReturnsTheBackup() {
        val backup = useCase().execute(file(), "backup.zip", mapOf("version" to "3"), "op-1")

        assertEquals(
            listOf("state:preparing", "state:checking-space", "state:uploading", "state:verifying", "state:done"),
            sink.names().filter { it.startsWith("state:") },
        )
        assertEquals("backup.zip", backup.name)
        assertEquals(4L, backup.bytes)
        assertEquals(listOf("backup.zip" to mapOf("version" to "3")), remote.uploads)
        assertEquals("op-1", sink.of("state").first()["operationId"])
    }

    @Test
    fun aFolder_isCompressedFirst_andTheTemporaryZipIsRemoved() {
        val folder = tmp.newFolder("source").apply { File(this, "a.txt").writeText("hello") }
        val temp = File(tmp.root, "tmp")
        val useCase = UploadBackup(remote, sink, { 1_000_000L }, temp, clock = { clock })

        useCase.execute(folder, "folder.zip", emptyMap(), "op-2")

        assertTrue(sink.names().contains("state:compressing"))
        assertEquals(emptyList<File>(), temp.listFiles()!!.toList())
    }

    @Test
    fun missingPath_isFile001_andNothingIsUploaded() {
        val error = errorOf { useCase().execute(File(tmp.root, "nope.zip"), "x", emptyMap(), "op-3") }
        assertEquals("file.001", error.code)
        assertEquals("error", sink.names().last())
        assertEquals(false, sink.of("error").single()["recoverable"])
        assertTrue(remote.uploads.isEmpty())
    }

    @Test
    fun emptyFile_isFile003() {
        assertEquals("file.003", errorOf { useCase().execute(file(0), "x", emptyMap(), "op-4") }.code)
    }

    @Test
    fun notEnoughDriveSpace_isSpace002_beforeUploading() {
        remote.space = DriveSpace(limitBytes = 1000, freeBytes = 3)
        val error = errorOf { useCase().execute(file(), "x", emptyMap(), "op-5") }
        assertEquals("space.002", error.code)
        assertEquals(mapOf("needed" to 4L, "free" to 3L), error.parameters)
        assertTrue(remote.uploads.isEmpty())
        assertFalse(sink.names().contains("state:uploading"))
    }

    @Test
    fun invalidMetadata_isMetadata001_withoutUploading() {
        val error = errorOf { useCase().execute(file(), "x", mapOf("big" to "x".repeat(200)), "op-6") }
        assertEquals("metadata.001", error.code)
        assertTrue(remote.uploads.isEmpty())
    }

    @Test
    fun quotaNearLimit_emitsASpace010Warning_andContinues() {
        remote.space = DriveSpace(limitBytes = 100, freeBytes = 5)
        useCase().execute(file(), "x", emptyMap(), "op-7")
        assertEquals("space.010", sink.of("warning").single()["code"])
        assertEquals(1, remote.uploads.size)
    }

    @Test
    fun sizeMismatch_isDrive001_withoutDone() {
        remote.returnedUploadBytes = 3
        val error = errorOf { useCase().execute(file(), "x", emptyMap(), "op-8") }
        assertEquals("drive.001", error.code)
        assertEquals("size-mismatch", error.parameters["reason"])
        assertFalse(sink.names().contains("state:done"))
    }

    @Test
    fun cancellationDuringUpload_emitsCancelled_andOperation001() {
        val cancel = CancellationToken()
        remote.beforeUpload = { cancel.cancel() }
        val error = errorOf { useCase().execute(file(), "x", emptyMap(), "op-9", cancel) }
        assertEquals("operation.001", error.code)
        assertEquals(listOf("state:cancelled", "error"), sink.names().takeLast(2))
    }

    @Test
    fun progressIsThrottled_butTheFinalValueAlwaysPasses() {
        clock = 0L
        val big = file(200 * 1024)
        useCase().execute(big, "x", emptyMap(), "op-10")
        val progress = sink.of("progress")
        assertEquals(200L * 1024, progress.last()["bytes"])
        assertEquals(1, progress.size) // one upload callback, clock never advances: only the first passes plus the final
    }
}
