package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class DownloadBackupTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val backup = RemoteBackup("F1", "backup.zip", 4, "2026-11-08T00:00:00.000Z", emptyMap())

    @Test
    fun downloadsTheBackup_verifiesSize_andEmitsThePhases() {
        val remote = FakeRemoteStorage().apply { put("F1", byteArrayOf(1, 2, 3, 4)) }
        val sink = RecordingSink()
        val destination = File(tmp.root, "out.zip")

        val result = DownloadBackup(remote, sink, { 1_000_000L }).execute(backup, destination, "op-1")

        assertEquals(
            listOf("state:preparing", "state:checking-space", "state:downloading", "state:verifying", "state:done"),
            sink.names().filter { it.startsWith("state:") },
        )
        assertEquals(4L, result["bytes"])
        assertEquals(4, destination.length().toInt())
    }

    @Test
    fun notEnoughLocalSpace_isSpace001_andNothingIsDownloaded() {
        val remote = FakeRemoteStorage().apply { put("F1", byteArrayOf(1, 2, 3, 4)) }
        val sink = RecordingSink()
        val destination = File(tmp.root, "out.zip")

        val error = assertThrows(ErrorBackup::class.java) {
            DownloadBackup(remote, sink, { 4L }).execute(backup, destination, "op-2")
        }

        assertEquals("space.001", error.code)
        assertFalse(sink.names().contains("state:downloading"))
        assertFalse(destination.exists())
    }

    @Test
    fun sizeMismatch_isDrive001_andTheDestinationIsDeleted() {
        val remote = FakeRemoteStorage().apply { put("F1", byteArrayOf(1, 2)) }
        val sink = RecordingSink()
        val destination = File(tmp.root, "out.zip")

        val error = assertThrows(ErrorBackup::class.java) {
            DownloadBackup(remote, sink, { 1_000_000L }).execute(backup, destination, "op-3")
        }

        assertEquals("drive.001", error.code)
        assertEquals("size-mismatch", error.parameters["reason"])
        assertFalse(destination.exists())
        assertTrue(sink.names().last() == "error")
    }
}
