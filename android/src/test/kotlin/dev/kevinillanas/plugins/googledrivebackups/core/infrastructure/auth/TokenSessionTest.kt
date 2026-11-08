package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.auth

import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenSessionTest {

    private var now = 0L
    private val session = TokenSession(clock = { now })

    private fun codeOf(block: () -> Unit): String = assertThrows(ErrorBackup::class.java) { block() }.code

    @Test
    fun beforeAnySignIn_tokenIsAuth001() {
        assertEquals("auth.001", codeOf { session.token() })
        assertFalse(session.isConnected())
    }

    @Test
    fun afterSignIn_theTokenIsReturned() {
        session.store("T1", 3600)
        assertEquals("T1", session.token())
        assertTrue(session.isConnected())
    }

    @Test
    fun afterExpiry_tokenIsAuth002_notAuth001() {
        session.store("T1", 3600)
        now = 3600_000L
        assertEquals("auth.002", codeOf { session.token() })
        assertFalse(session.isConnected())
    }

    @Test
    fun oneMinuteBeforeExpiry_theTokenCountsAsExpired() {
        session.store("T1", 3600)
        now = 3600_000L - 60_000L
        assertFalse(session.isConnected())
        assertEquals("auth.002", codeOf { session.token() })
    }

    @Test
    fun clear_forgetsTheToken_butKeepsTheSignedInHistory() {
        session.store("T1", 3600)
        session.clear()
        assertFalse(session.isConnected())
        assertEquals("auth.002", codeOf { session.token() })
    }
}
