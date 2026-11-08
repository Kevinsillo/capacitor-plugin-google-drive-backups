package dev.kevinillanas.plugins.googledrivebackups.core.infrastructure.auth

import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import android.accounts.Account
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import dev.kevinillanas.plugins.googledrivebackups.core.domain.ErrorBackup

/**
 * Google sign-in for Android with the Identity authorization API. Must be created while the activity is being
 * set up (the plugin's `load()`), because it registers an activity result launcher. The consent screen, when
 * Google shows one, runs through that launcher and the result comes back to [signIn]'s callback.
 *
 * Needs a device with Google Play services and an Android OAuth client in Google Cloud. Not covered by unit
 * tests: it is checked on a device.
 */
/**
 * [scope] can change without recreating the launcher (see `configure`).
 */
class GoogleAuth(
    private val activity: AppCompatActivity,
    private val session: TokenSession,
    var scope: String,
) {
    private var pending: ((Result<String>) -> Unit)? = null

    private val consentLauncher: ActivityResultLauncher<IntentSenderRequest> =
        activity.registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            val callback = pending
            pending = null
            val outcome = runCatching {
                val authorization = Identity.getAuthorizationClient(activity)
                    .getAuthorizationResultFromIntent(result.data)
                val token = authorization.accessToken ?: throw ErrorBackup("auth.003")
                session.store(token, DEFAULT_TOKEN_LIFETIME_S)
                token
            }.recoverCatching {
                Log.w(TAG, "Consent finished without an access token: resultCode=${result.resultCode}", it)
                throw ErrorBackup("auth.003")
            }
            callback?.invoke(outcome)
        }

    /**
     * Starts sign-in. With [account], Google authorizes that account and, if access was already granted, returns
     * the token without showing any screen. [onResult] receives the access token, or `auth.003` if the user
     * cancels or denies access.
     */
    fun signIn(account: String?, onResult: (Result<String>) -> Unit) {
        val request = AuthorizationRequest.builder()
            .setRequestedScopes(listOf(Scope(scope)))
            .apply { account?.takeIf { it.isNotBlank() }?.let { setAccount(Account(it, GOOGLE_ACCOUNT_TYPE)) } }
            .build()
        Identity.getAuthorizationClient(activity)
            .authorize(request)
            .addOnSuccessListener { authorization ->
                if (authorization.hasResolution()) {
                    val intentSender = authorization.pendingIntent?.intentSender
                    if (intentSender == null) {
                        onResult(Result.failure(ErrorBackup("auth.003")))
                        return@addOnSuccessListener
                    }
                    pending = onResult
                    consentLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
                } else {
                    val token = authorization.accessToken
                    if (token == null) {
                        onResult(Result.failure(ErrorBackup("auth.003")))
                    } else {
                        session.store(token, DEFAULT_TOKEN_LIFETIME_S)
                        onResult(Result.success(token))
                    }
                }
            }
            .addOnFailureListener { error ->
                Log.w(TAG, "Authorization request failed", error)
                onResult(Result.failure(ErrorBackup("auth.003")))
            }
    }

    private companion object {
        const val TAG = "GoogleDriveBackups"
        /** The authorization result does not report its expiry; Google access tokens last one hour. */
        const val DEFAULT_TOKEN_LIFETIME_S = 3600L
        const val GOOGLE_ACCOUNT_TYPE = "com.google"
    }
}
