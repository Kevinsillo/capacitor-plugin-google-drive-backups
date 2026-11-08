package dev.kevinillanas.plugins.googledrivebackups.core.domain

/** Mirror of `src/core/domain/metadata.ts`. Limits of `appProperties` in Drive v3. */
const val MAX_METADATA_PROPERTIES = 30
const val MAX_PROPERTY_BYTES = 124

/**
 * Throws `ErrorBackup("metadata.001")` if the metadata exceeds the Drive limits.
 * Bytes are counted in UTF-8, key and value together, as in TypeScript.
 */
fun validateMetadata(metadata: Map<String, String>) {
    if (metadata.size > MAX_METADATA_PROPERTIES) {
        throw ErrorBackup(
            "metadata.001",
            mapOf("reason" to "too-many-properties", "count" to metadata.size, "max" to MAX_METADATA_PROPERTIES),
        )
    }
    for ((key, value) in metadata) {
        val bytes = key.toByteArray(Charsets.UTF_8).size + value.toByteArray(Charsets.UTF_8).size
        if (bytes > MAX_PROPERTY_BYTES) {
            throw ErrorBackup(
                "metadata.001",
                mapOf("reason" to "property-too-long", "key" to key, "bytes" to bytes, "max" to MAX_PROPERTY_BYTES),
            )
        }
    }
}
