package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive

import com.google.gson.JsonParser
import dev.kevinillanas.plugins.googledrivebackups.core.domain.isRetryable
import dev.kevinillanas.plugins.googledrivebackups.core.domain.translateDriveError
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** Parity with TypeScript: the same `tests/fixtures/drive-errors.json` as `driveErrors.parity.test.ts`. */
class DriveErrorsParityTest {

    @Test
    fun everyFixtureCase_mapsToTheSameCodeAndRetryFlag() {
        val cases = JsonParser.parseReader(File("../tests/fixtures/drive-errors.json").reader(Charsets.UTF_8))
            .asJsonObject.getAsJsonArray("cases")

        for (element in cases) {
            val case = element.asJsonObject
            val status = case.get("status").asInt
            val reason = case.get("reason").takeUnless { it.isJsonNull }?.asString
            assertEquals(case.toString(), case.get("code").asString, translateDriveError(status, reason).code)
            assertEquals(case.toString(), case.get("retryable").asBoolean, isRetryable(status, reason))
        }
    }
}
