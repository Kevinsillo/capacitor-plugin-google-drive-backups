package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.storage

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class FolderZipperTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun estimateBytes_sumsRegularFilesRecursively() {
        val folder = tmp.newFolder("f")
        File(folder, "a").writeBytes(ByteArray(10))
        File(folder, "sub").mkdir()
        File(folder, "sub/b").writeBytes(ByteArray(32))

        assertEquals(42L, FolderZipper().estimateBytes(folder))
    }

    @Test
    fun estimateBytes_onAFile_throwsFile001() {
        val file = File(tmp.root, "plain.txt").apply { writeText("x") }
        val error = assertThrows(ErrorBackup::class.java) { FolderZipper().estimateBytes(file) }
        assertEquals("file.001", error.code)
    }

    @Test
    fun zip_bigFile_reportsEveryChunk_andTotalsMatch() {
        val folder = tmp.newFolder("big")
        File(folder, "data").writeBytes(ByteArray(200 * 1024)) // larger than the 64 KiB buffer
        val seen = mutableListOf<Long>()

        FolderZipper().zip(folder, File(tmp.root, "big.zip")) { bytes, total ->
            seen += bytes
            assertEquals(200L * 1024, total)
        }

        assertEquals(4, seen.size) // 64 + 64 + 64 + 8 KiB
        assertEquals(200L * 1024, seen.last())
        assertEquals(seen.sorted(), seen) // monotonically increasing
    }
}
