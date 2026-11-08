package dev.kevinillanas.plugins.googledrivebackups.core.domain

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** Parity with TypeScript: reads the same `tests/fixtures/error-codes.json` as `errorCodes.parity.test.ts`. */
class ErrorCatalogParityTest {

    private val expected: Map<String, Boolean> = JsonParser.parseReader(
        File("../tests/fixtures/error-codes.json").reader(Charsets.UTF_8),
    ).asJsonObject.getAsJsonObject("codes").entrySet().associate { (code, recoverable) ->
        code to recoverable.asBoolean
    }

    @Test
    fun codes_matchTheTypeScriptCatalog() {
        assertEquals(expected.keys.sorted(), ErrorCatalog.codes.sorted())
    }

    @Test
    fun recoverableFlags_matchTheTypeScriptCatalog() {
        for ((code, recoverable) in expected) {
            assertEquals(code, recoverable, ErrorCatalog.isRecoverable(code))
        }
    }
}
