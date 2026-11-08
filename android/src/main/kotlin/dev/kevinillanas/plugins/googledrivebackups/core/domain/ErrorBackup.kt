package dev.kevinillanas.plugins.googledrivebackups.core.domain

/**
 * Plugin error with a catalog code in the form `category.number`. Mirror of `ErrorBackup` in
 * TypeScript (`src/core/domain/errors.ts`). The full catalog arrives with the native bridge.
 */
class ErrorBackup(
    val code: String,
    val parameters: Map<String, Any> = emptyMap(),
    message: String = code,
) : Exception(message)
