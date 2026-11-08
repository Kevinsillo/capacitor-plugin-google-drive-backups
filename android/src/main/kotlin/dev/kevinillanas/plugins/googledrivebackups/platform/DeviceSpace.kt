package dev.kevinillanas.plugins.googledrivebackups.platform

import android.os.StatFs
import java.io.File

/** Free bytes of the file system that holds [file]. Uses the file itself, or its parent if it does not exist yet. */
object DeviceSpace {
    fun freeBytes(file: File): Long {
        val target = if (file.exists()) file else file.absoluteFile.parentFile ?: file
        return StatFs(target.path).availableBytes
    }
}
