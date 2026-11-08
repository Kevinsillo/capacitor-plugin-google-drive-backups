package dev.kevinillanas.plugins.googledrivebackups.core.application

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.storage.FolderZipper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.zip.ZipFile

class CompressFolderTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun folderWithFiles(): File {
        val folder = tmp.newFolder("source")
        File(folder, "a.txt").writeText("hello")
        File(folder, "nested").mkdir()
        File(folder, "nested/b.txt").writeText("world!")
        return folder
    }

    private fun useCase(free: Long) = CompressFolder(FolderZipper(), freeSpace = { free })

    @Test
    fun compresses_allFiles_withRelativeEntryNames() {
        val folder = folderWithFiles()
        val target = File(tmp.root, "out.zip")

        useCase(free = 1_000_000).execute(folder, target)

        ZipFile(target).use { zip ->
            val names = zip.entries().toList().map { it.name }.sorted()
            assertEquals(listOf("a.txt", "nested/b.txt"), names)
            assertEquals("world!", zip.getInputStream(zip.getEntry("nested/b.txt")).readBytes().decodeToString())
        }
    }

    @Test
    fun reportsProgress_endingAtTheTotal() {
        val folder = folderWithFiles()
        var last: Pair<Long, Long>? = null

        useCase(free = 1_000_000).execute(folder, File(tmp.root, "out.zip")) { bytes, total -> last = bytes to total }

        assertEquals(5L + 6L, last?.first)
        assertEquals(5L + 6L, last?.second)
    }

    @Test
    fun notEnoughSpace_throwsSpace001_andWritesNothing() {
        val folder = folderWithFiles() // 11 bytes; needs 12 with the 1.1 margin
        val target = File(tmp.root, "out.zip")

        val error = assertThrows(ErrorBackup::class.java) { useCase(free = 11).execute(folder, target) }

        assertEquals("space.001", error.code)
        assertEquals(11L, error.parameters["needed"])
        assertFalse(target.exists())
    }

    @Test
    fun exactlyEnoughSpace_succeeds() {
        val folder = folderWithFiles()
        val target = File(tmp.root, "out.zip")
        useCase(free = 13).execute(folder, target) // 11 × 1.1 = 12.1, rounded up to 13
        assertTrue(target.exists())
    }

    @Test
    fun missingFolder_throwsFile001() {
        val error = assertThrows(ErrorBackup::class.java) {
            useCase(free = 1_000_000).execute(File(tmp.root, "nope"), File(tmp.root, "out.zip"))
        }
        assertEquals("file.001", error.code)
    }

    @Test
    fun emptyFolder_throwsFile003() {
        val empty = tmp.newFolder("empty")
        val error = assertThrows(ErrorBackup::class.java) {
            useCase(free = 1_000_000).execute(empty, File(tmp.root, "out.zip"))
        }
        assertEquals("file.003", error.code)
    }
}
