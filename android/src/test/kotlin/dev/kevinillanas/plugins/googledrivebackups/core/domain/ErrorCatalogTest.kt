package dev.kevinillanas.plugins.googledrivebackups.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorCatalogTest {

    @Test
    fun recoverableFlags_matchTheTypeScriptCatalog() {
        assertTrue(ErrorCatalog.isRecoverable("space.002"))
        assertTrue(ErrorCatalog.isRecoverable("auth.002"))
        assertTrue(ErrorCatalog.isRecoverable("network.001"))
        assertFalse(ErrorCatalog.isRecoverable("file.001"))
        assertFalse(ErrorCatalog.isRecoverable("drive.001"))
        assertFalse(ErrorCatalog.isRecoverable("unknown.999"))
    }

    @Test
    fun everyCodeTheNativeSideEmits_isInTheCatalog() {
        val emitted = listOf(
            "auth.002", "drive.002", "drive.003", "network.003", "space.002", "drive.001",
            "file.001", "file.003", "space.001", "space.010", "metadata.001", "operation.001", "network.001", "network.002",
        )
        for (code in emitted) assertTrue(code, ErrorCatalog.codes.contains(code))
        assertEquals(emitted.size, emitted.toSet().size)
    }
}
