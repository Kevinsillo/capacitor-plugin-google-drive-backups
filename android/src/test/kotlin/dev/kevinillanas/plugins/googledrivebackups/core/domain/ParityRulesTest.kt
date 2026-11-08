package dev.kevinillanas.plugins.googledrivebackups.core.domain

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Parity with TypeScript: reads `tests/fixtures/rules.json` (the same file Vitest uses).
 * Gradle runs the tests with the `android/` directory as working directory, hence the relative path.
 */
class ParityRulesTest {

    private val fixture: JsonObject = JsonParser.parseReader(
        File("../tests/fixtures/rules.json").reader(Charsets.UTF_8),
    ).asJsonObject

    private fun cases(name: String) = fixture.getAsJsonArray(name).map { it.asJsonObject }

    @Test
    fun hasEnoughSpace_matchesTypeScript() {
        for (case in cases("hasEnoughSpace")) {
            val result = hasEnoughSpace(
                case.get("free").asLong,
                case.get("needed").asLong,
                case.get("margin").asDouble,
            )
            assertEquals(case.toString(), case.get("expected").asBoolean, result)
        }
    }

    @Test
    fun quotaNearLimit_matchesTypeScript() {
        for (case in cases("quotaNearLimit")) {
            val result = quotaNearLimit(case.get("limit").asLong, case.get("free").asLong)
            assertEquals(case.toString(), case.get("expected").asBoolean, result)
        }
    }

    @Test
    fun shouldEmitProgress_matchesTypeScript() {
        for (case in cases("shouldEmitProgress")) {
            val last = case.get("last").takeUnless { it.isJsonNull }?.asLong
            val result = shouldEmitProgress(last, case.get("now").asLong)
            assertEquals(case.toString(), case.get("expected").asBoolean, result)
        }
    }

    @Test
    fun validateMetadata_matchesTypeScript() {
        for (case in cases("validateMetadata")) {
            val expected = case.get("expected").takeUnless { it.isJsonNull }?.asString
            val code = try {
                validateMetadata(buildMetadata(case))
                null
            } catch (error: ErrorBackup) {
                error.code
            }
            assertEquals(case.get("description").asString, expected, code)
        }
    }

    /** Expands a case: a literal map, or `properties` (N keys k0..kN with value "v"). */
    private fun buildMetadata(case: JsonObject): Map<String, String> {
        if (case.has("properties")) {
            return (0 until case.get("properties").asInt).associate { "k$it" to "v" }
        }
        val map = LinkedHashMap<String, String>()
        for ((key, value) in case.getAsJsonObject("metadata").entrySet()) {
            map[key] = expandValue(value)
        }
        return map
    }

    private fun expandValue(value: JsonElement): String {
        if (value.isJsonPrimitive) return value.asString
        val obj = value.asJsonObject
        return obj.get("character").asString.repeat(obj.get("times").asInt)
    }

    @Test
    fun fixtureHasCasesForEveryRule() {
        for (rule in listOf("hasEnoughSpace", "quotaNearLimit", "shouldEmitProgress", "validateMetadata")) {
            assertTrue("missing $rule", cases(rule).isNotEmpty())
        }
    }
}
