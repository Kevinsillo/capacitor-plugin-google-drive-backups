package dev.kevinillanas.plugins.googledrivebackups.platform

import com.getcapacitor.JSObject
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.RemoteBackup
import org.json.JSONArray
import org.json.JSONObject

/** Converts plain Kotlin values from the use cases into the JSON values the bridge sends to JavaScript. */
internal fun toJsObject(data: Map<String, Any?>): JSObject {
    val obj = JSObject()
    data.forEach { (key, value) -> obj.put(key, toJsValue(value)) }
    return obj
}

private fun toJsValue(value: Any?): Any = when (value) {
    null -> JSONObject.NULL
    is Map<*, *> -> toJsObject(value.entries.associate { it.key.toString() to it.value })
    is Iterable<*> -> JSONArray(value.map { toJsValue(it) })
    else -> value
}

internal fun backupToJs(backup: RemoteBackup): JSObject = JSObject()
    .put("id", backup.id)
    .put("name", backup.name)
    .put("bytes", backup.bytes)
    .put("createdAt", backup.createdAt)
    .put("metadata", JSONObject(backup.metadata))

/** Body of the `error` event and of a rejection, with the same fields as the TypeScript `ErrorEvent`. */
internal fun errorToJs(error: ErrorBackup, operationId: String?, recoverable: Boolean): JSObject {
    val obj = JSObject()
        .put("code", error.code)
        .put("parameters", toJsObject(error.parameters))
        .put("message", error.message ?: error.code)
        .put("recoverable", recoverable)
    operationId?.let { obj.put("operationId", it) }
    return obj
}
