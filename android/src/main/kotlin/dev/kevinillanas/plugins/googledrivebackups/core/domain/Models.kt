package dev.kevinillanas.plugins.googledrivebackups.core.domain

/** Backup stored in Google Drive. Mirror of `RemoteBackup` in TypeScript. */
data class RemoteBackup(
    val id: String,
    val name: String,
    val bytes: Long,
    val createdAt: String,
    val metadata: Map<String, String>,
)

/** Drive quota. Both fields are null when the account reports no limit. */
data class DriveSpace(
    val limitBytes: Long?,
    val freeBytes: Long?,
)
