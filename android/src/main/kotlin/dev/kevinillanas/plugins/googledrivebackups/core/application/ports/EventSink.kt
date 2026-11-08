package dev.kevinillanas.plugins.googledrivebackups.core.application.ports

/**
 * Output port towards the bridge. The Android implementation calls `notifyListeners`; tests record the
 * events. [event] is one of `state`, `progress`, `warning`, `error` or `log`.
 */
interface EventSink {
    fun emit(event: String, data: Map<String, Any?>)
}
