package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.storage

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Compresses a folder into a zip, streaming file by file so memory use does not grow with the backup.
 * Entry names are relative to the folder and always use `/`, whatever the platform.
 */
class FolderZipper {

    /** Total bytes of the regular files under [folder]. Throws `file.001` if it is not a folder. */
    fun estimateBytes(folder: File): Long = filesOf(folder).sumOf { it.length() }

    /**
     * Writes [target] as a zip of [folder]. [onProgress] receives bytes written so far and the total
     * input bytes; it is called after every chunk. Throws `file.001` for a missing folder and
     * `file.003` for a folder with no files.
     */
    fun zip(folder: File, target: File, onProgress: (bytes: Long, total: Long) -> Unit = { _, _ -> }) {
        val files = filesOf(folder)
        if (files.isEmpty()) throw ErrorBackup("file.003", mapOf("path" to folder.path))

        val total = files.sumOf { it.length() }
        var done = 0L
        val buffer = ByteArray(BUFFER_SIZE)

        ZipOutputStream(BufferedOutputStream(FileOutputStream(target))).use { zip ->
            for (file in files) {
                zip.putNextEntry(ZipEntry(entryName(folder, file)))
                file.inputStream().use { input ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        zip.write(buffer, 0, read)
                        done += read
                        onProgress(done, total)
                    }
                }
                zip.closeEntry()
            }
        }
    }

    private fun filesOf(folder: File): List<File> {
        if (!folder.isDirectory) throw ErrorBackup("file.001", mapOf("path" to folder.path))
        return folder.walkTopDown().filter { it.isFile }.sortedBy { it.path }.toList()
    }

    private fun entryName(folder: File, file: File): String =
        file.relativeTo(folder).invariantSeparatorsPath

    private companion object {
        const val BUFFER_SIZE = 64 * 1024
    }
}
