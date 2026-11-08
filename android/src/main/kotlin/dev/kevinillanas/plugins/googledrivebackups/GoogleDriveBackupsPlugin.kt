package dev.kevinillanas.plugins.googledrivebackups

import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import dev.kevinillanas.plugins.googledrivebackups.core.application.CancellationToken
import dev.kevinillanas.plugins.googledrivebackups.core.application.CheckSpace
import dev.kevinillanas.plugins.googledrivebackups.core.application.DownloadBackup
import dev.kevinillanas.plugins.googledrivebackups.core.application.UploadBackup
import dev.kevinillanas.plugins.googledrivebackups.core.application.closeWithError
import dev.kevinillanas.plugins.googledrivebackups.core.application.ports.EventSink
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorCatalog
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.auth.GoogleAuth
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.auth.TokenSession
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive.DriveRestClient
import dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.drive.HttpUrlTransport
import dev.kevinillanas.plugins.googledrivebackups.platform.DeviceSpace
import dev.kevinillanas.plugins.googledrivebackups.platform.NetworkState
import dev.kevinillanas.plugins.googledrivebackups.platform.backupToJs
import dev.kevinillanas.plugins.googledrivebackups.platform.errorToJs
import dev.kevinillanas.plugins.googledrivebackups.platform.toJsObject
import org.json.JSONArray
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Capacitor bridge for Android. Every method delegates to a use case and runs off the main thread. Events
 * reach JavaScript through `notifyListeners`, on the main thread. Method names and payloads match the
 * TypeScript contract in `src/definitions.ts`.
 */
@CapacitorPlugin(name = "GoogleDriveBackups")
class GoogleDriveBackupsPlugin : Plugin() {

    private val session = TokenSession()
    private val executor: ExecutorService = Executors.newCachedThreadPool()
    private val operations = ConcurrentHashMap<String, CancellationToken>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var storageLocation = "appDataFolder"
    private var account: String? = null
    private var googleAuth: GoogleAuth? = null

    private val sink = object : EventSink {
        override fun emit(event: String, data: Map<String, Any?>) {
            val payload = toJsObject(data)
            mainHandler.post { notifyListeners(event, payload) }
        }
    }

    override fun load() {
        super.load()
        googleAuth = GoogleAuth(getActivity(), session, scopeFor(storageLocation))
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        call.getString("storageLocation")?.let { location ->
            if (location != storageLocation) {
                storageLocation = location
                session.clear()
                account = null
                googleAuth?.scope = scopeFor(location)
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun signIn(call: PluginCall) {
        val auth = googleAuth ?: return reject(call, ErrorBackup("configuration.001", mapOf("missing" to "activity")))
        auth.signIn { outcome ->
            outcome.fold(
                onSuccess = {
                    executor.execute {
                        runCatching {
                            account = remote().accountEmail() ?: ""
                            JSObject().put("account", account)
                        }.fold(
                            onSuccess = { call.resolve(it) },
                            onFailure = { reject(call, it) },
                        )
                    }
                },
                onFailure = { reject(call, it) },
            )
        }
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        session.clear()
        account = null
        call.resolve()
    }

    @PluginMethod
    fun sessionStatus(call: PluginCall) {
        val connected = session.isConnected()
        val result = JSObject().put("connected", connected)
        if (connected && account != null) result.put("account", account)
        call.resolve(result)
    }

    @PluginMethod
    fun space(call: PluginCall) = runOperation(call, operationId = null) {
        toJsObject(CheckSpace(remote(), { DeviceSpace.freeBytes(it) }, sink, cacheDir()).execute())
    }

    @PluginMethod
    fun upload(call: PluginCall) {
        val path = call.getString("path")
        val name = call.getString("name")
        if (path == null || name == null) {
            return reject(call, ErrorBackup("configuration.001", mapOf("missing" to "path or name")))
        }
        val metadataObject = call.getObject("metadata")
        val metadata = metadataObject?.keys()?.asSequence()
            ?.associateWith { metadataObject.getString(it) ?: "" }
            ?: emptyMap()
        val operationId = call.getString("operationId") ?: UUID.randomUUID().toString()
        val cancel = CancellationToken()
        if (operations.putIfAbsent(operationId, cancel) != null) {
            return reject(call, ErrorBackup("operation.002"))
        }

        executor.execute {
            try {
                if (!NetworkState.isOnline(context)) {
                    throw sink.closeWithError(operationId, ErrorBackup("network.001"), cancelled = false)
                }
                if (NetworkState.isMetered(context)) {
                    sink.emit("warning", mapOf("operationId" to operationId, "code" to "network.010", "parameters" to emptyMap<String, Any>()))
                }
                val backup = UploadBackup(remote(), sink, { DeviceSpace.freeBytes(it) }, File(cacheDir(), "upload-temp"))
                    .execute(File(path), name, metadata, operationId, cancel)
                call.resolve(backupToJs(backup).put("operationId", operationId))
            } catch (failure: Throwable) {
                reject(call, failure)
            } finally {
                operations.remove(operationId)
            }
        }
    }

    @PluginMethod
    fun list(call: PluginCall) = runOperation(call, operationId = null) {
        val backups = JSONArray()
        remote().list().forEach { backups.put(backupToJs(it)) }
        JSObject().put("backups", backups)
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val id = call.getString("id")
        val destination = call.getString("destination")
        if (id == null || destination == null) {
            return reject(call, ErrorBackup("configuration.001", mapOf("missing" to "id or destination")))
        }
        val operationId = call.getString("operationId") ?: UUID.randomUUID().toString()
        val cancel = CancellationToken()
        if (operations.putIfAbsent(operationId, cancel) != null) {
            return reject(call, ErrorBackup("operation.002"))
        }

        executor.execute {
            try {
                val backup = remote().list().firstOrNull { it.id == id }
                    ?: throw sink.closeWithError(operationId, ErrorBackup("drive.002", mapOf("id" to id)), cancelled = false)
                val result = DownloadBackup(remote(), sink, { DeviceSpace.freeBytes(it) })
                    .execute(backup, File(destination), operationId, cancel)
                call.resolve(toJsObject(result))
            } catch (failure: Throwable) {
                reject(call, failure)
            } finally {
                operations.remove(operationId)
            }
        }
    }

    @PluginMethod
    fun delete(call: PluginCall) {
        val id = call.getString("id") ?: return reject(call, ErrorBackup("configuration.001", mapOf("missing" to "id")))
        runOperation(call, operationId = null) {
            remote().delete(id)
            JSObject()
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        call.getString("operationId")?.let { operations[it]?.cancel() }
        call.resolve()
    }

    /** Runs a short operation off the main thread and reports any failure as an `error` event, then a rejection. */
    private fun runOperation(call: PluginCall, operationId: String?, work: () -> JSObject) {
        executor.execute {
            try {
                call.resolve(work())
            } catch (failure: Throwable) {
                val error = failure as? ErrorBackup ?: ErrorBackup("drive.001", mapOf("reason" to "unexpected"), failure.message ?: failure.toString())
                emitError(error, operationId)
                reject(call, error)
            }
        }
    }

    private fun remote() = DriveRestClient(
        transport = HttpUrlTransport(),
        token = { session.token() },
        storageLocation = storageLocation,
    )

    private fun cacheDir(): File = context.cacheDir

    private fun emitError(error: ErrorBackup, operationId: String?) {
        sink.emit(
            "error",
            buildMap {
                operationId?.let { put("operationId", it) }
                put("code", error.code)
                put("parameters", error.parameters)
                put("message", error.message ?: error.code)
                put("recoverable", ErrorCatalog.isRecoverable(error.code))
            },
        )
    }

    /** Rejects with the catalog code, the parameters and the recoverable flag. Non-plugin errors become `drive.001`. */
    private fun reject(call: PluginCall, failure: Throwable) {
        val error = failure as? ErrorBackup ?: ErrorBackup("drive.001", mapOf("reason" to "unexpected"), failure.message ?: failure.toString())
        val data = errorToJs(error, null, ErrorCatalog.isRecoverable(error.code))
        call.reject(error.message ?: error.code, error.code, data)
    }

    private fun scopeFor(location: String): String =
        if (location == "drive") DRIVE_FILE_SCOPE else DRIVE_APPDATA_SCOPE

    private companion object {
        const val DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
        const val DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
    }
}
