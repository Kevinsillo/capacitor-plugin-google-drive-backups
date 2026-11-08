<div align="center">

# Google Drive Backups

***Google Drive backups for Capacitor apps — sign in, transfer, and report every step.***

[![CI](https://img.shields.io/github/actions/workflow/status/Kevinsillo/capacitor-plugin-google-drive-backups/ci.yml?style=flat-square&label=tests)](https://github.com/Kevinsillo/capacitor-plugin-google-drive-backups/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-android%20%7C%20web-blue?style=flat-square)](https://github.com/Kevinsillo/capacitor-plugin-google-drive-backups)
[![Capacitor](https://img.shields.io/badge/capacitor-%E2%89%A58-119EFF?style=flat-square&logo=capacitor)](https://capacitorjs.com)

</div>

Google Drive backups for Capacitor apps. The plugin signs in with Google, uploads and downloads backup files, lists and deletes them, and reports every step over the bridge: phases, progress, warnings and typed errors, including "not enough space" on the device or in Drive.

The plugin is generic. It transports files and reports what happens. It does not decide when to back up, what to save, how to name it, which backup to restore, or whether to encrypt it. Those choices belong to your app.

## Status and support

> **Use at your own risk.** This plugin is provided as is, without warranty of any kind, under the [MIT license](LICENSE). The maintainer will try to fix errors on a best-effort basis, but there is no guaranteed response time or support commitment. Test backups and restores in your own app before relying on them with real data.

Bug reports and feature requests are welcome in the GitHub issue tracker. Please use the issue templates so the report includes the information needed to reproduce it.

## Features

- Sign in with Google on Android (native) and on the web (Google Identity Services).
- Upload a file, or a folder that the plugin compresses first, to Google Drive.
- List backups, newest first, with metadata that your app defines.
- Download a backup to a local path and delete it from Drive.
- Check free space on the device and in Drive before every transfer.
- Progress, phase and error events, with error codes you can translate in your app.

## Requirements

- Capacitor 8.
- Android: `minSdkVersion` 24 or higher.
- A Google Cloud project with the Google Drive API enabled, and an OAuth client for Android (package name and SHA-1 of your signing key). A web OAuth client is needed only if you use the plugin in the browser.

## Install

To use npm

```bash
npm install capacitor-plugin-google-drive-backups
```

To use yarn

```bash
yarn add capacitor-plugin-google-drive-backups
```

Sync native files

```bash
npx cap sync
```

## Quick start

```ts
import { GoogleDriveBackups } from 'capacitor-plugin-google-drive-backups';

await GoogleDriveBackups.configure({ logLevel: 'info', webClientId: 'YOUR_WEB_CLIENT_ID' });

const { account } = await GoogleDriveBackups.signIn();

const listener = await GoogleDriveBackups.addListener('progress', ({ bytes, total }) => {
  console.log(`${bytes} / ${total} bytes`);
});

try {
  const backup = await GoogleDriveBackups.upload({
    path: '/path/to/backup.zip',
    name: 'my-app-2026-11-08.zip',
    metadata: { formatVersion: '3' },
  });
  console.log('Uploaded', backup.id);
} catch (error) {
  // Every failure also emits an `error` event with a code such as `space.002`.
  console.error(error);
} finally {
  await listener.remove();
}
```

## Configuration

`configure` takes three optional fields:

| Field | Default | Meaning |
| --- | --- | --- |
| `logLevel` | `silent` | `info` or `debug` enables `log` events for troubleshooting. |
| `webClientId` | none | OAuth client id for the browser. Required on the web only. |
| `storageLocation` | `appDataFolder` | `appDataFolder` keeps backups private to your app. `drive` stores them in the visible Drive. Changing it signs the user out. |

## Errors and translations

Errors are rejected with a code in the form `category.number` (for example `space.002`) and emitted as `error` events before the rejection. The plugin does not translate messages. Your app maps each code to its own text. The full catalog is exported as `ERROR_CODES`.

## API

<docgen-index>

* [`configure(...)`](#configure)
* [`signIn(...)`](#signin)
* [`signOut()`](#signout)
* [`sessionStatus()`](#sessionstatus)
* [`space()`](#space)
* [`upload(...)`](#upload)
* [`list()`](#list)
* [`download(...)`](#download)
* [`delete(...)`](#delete)
* [`cancel(...)`](#cancel)
* [`addListener(E, ...)`](#addlistenere-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### configure(...)

```typescript
configure(options: { logLevel?: LogLevel; webClientId?: string; storageLocation?: 'appDataFolder' | 'drive'; folderName?: string | null; }) => Promise<void>
```

Sets the plugin configuration. Every field is optional.
- `logLevel`: level of `log` events. Default `silent`.
- `webClientId`: OAuth client id for the browser (Google Identity Services). Required on the web only.
- `storageLocation`: `appDataFolder` (private to the app, default) or `drive` (visible Drive).
  Changing it or `webClientId` signs the user out.
- `folderName`: folder that holds the backups. By default, on Android with `drive` it is the app's
  package name (for example `dev.example.app`); with `appDataFolder`, and on the web, there is no
  folder. `''` means no folder, and `null` restores the default. Changing it does not sign the user
  out, but backups in the previous folder are no longer listed.

| Param         | Type                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`options`** | <code>{ logLevel?: <a href="#loglevel">LogLevel</a>; webClientId?: string; storageLocation?: 'appDataFolder' \| 'drive'; folderName?: string; }</code> |

--------------------


### signIn(...)

```typescript
signIn(options?: { account?: string; }) => Promise<{ account: string; }>
```

Signs in with Google. Rejects with `auth.003` if the user cancels. `account` is the email of the
signed-in user, or an empty string if it cannot be read. On Android, passing `account` (the email used
before) signs that account in without a picker when access was already granted. The web ignores it.

| Param         | Type                               |
| ------------- | ---------------------------------- |
| **`options`** | <code>{ account?: string; }</code> |

**Returns:** <code>Promise&lt;{ account: string; }&gt;</code>

--------------------


### signOut()

```typescript
signOut() => Promise<void>
```

Signs out and forgets the token. Does not delete backups in Drive.

--------------------


### sessionStatus()

```typescript
sessionStatus() => Promise<{ connected: boolean; account?: string; }>
```

**Returns:** <code>Promise&lt;{ connected: boolean; account?: string; }&gt;</code>

--------------------


### space()

```typescript
space() => Promise<SpaceInfo>
```

Free space on the device and, with a session, in Drive.

**Returns:** <code>Promise&lt;<a href="#spaceinfo">SpaceInfo</a>&gt;</code>

--------------------


### upload(...)

```typescript
upload(options: { path: string; name: string; metadata?: Record<string, string>; operationId?: string; }) => Promise<RemoteBackup & { operationId: string; }>
```

Uploads a local file to Drive. Checks Drive space before uploading (`space.002`).
`metadata` is optional and defined by the app; Drive stores it and `list` returns it.
Emits `state`, `progress`, `warning` and `error`. `operationId` is optional: if omitted,
the plugin generates one and returns it.

| Param         | Type                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **`options`** | <code>{ path: string; name: string; metadata?: <a href="#record">Record</a>&lt;string, string&gt;; operationId?: string; }</code> |

**Returns:** <code>Promise&lt;<a href="#remotebackup">RemoteBackup</a> & { operationId: string; }&gt;</code>

--------------------


### list()

```typescript
list() => Promise<{ backups: RemoteBackup[]; }>
```

Lists the backups in Drive, newest first. It does not choose one: the app does.

**Returns:** <code>Promise&lt;{ backups: RemoteBackup[]; }&gt;</code>

--------------------


### download(...)

```typescript
download(options: { id: string; destination: string; operationId?: string; }) => Promise<{ operationId: string; path: string; bytes: number; }>
```

Downloads a backup to `destination` (a local path). Emits the same events as `upload`.

| Param         | Type                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| **`options`** | <code>{ id: string; destination: string; operationId?: string; }</code> |

**Returns:** <code>Promise&lt;{ operationId: string; path: string; bytes: number; }&gt;</code>

--------------------


### delete(...)

```typescript
delete(options: { id: string; }) => Promise<void>
```

Deletes a backup from Drive. Rejects with `drive.002` if it does not exist.

| Param         | Type                         |
| ------------- | ---------------------------- |
| **`options`** | <code>{ id: string; }</code> |

--------------------


### cancel(...)

```typescript
cancel(options: { operationId: string; }) => Promise<void>
```

Cancels an upload or download in progress. The cancelled operation rejects with `operation.001`.

| Param         | Type                                  |
| ------------- | ------------------------------------- |
| **`options`** | <code>{ operationId: string; }</code> |

--------------------


### addListener(E, ...)

```typescript
addListener<E extends keyof EventMap>(event: E, listener: (data: EventMap[E]) => void) => Promise<PluginListenerHandle>
```

| Param          | Type                                        |
| -------------- | ------------------------------------------- |
| **`event`**    | <code>E</code>                              |
| **`listener`** | <code>(data: EventMap[E]) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

--------------------


### Interfaces


#### SpaceInfo

Available space. The Drive fields are optional because they depend on the session.

| Prop                  | Type                |
| --------------------- | ------------------- |
| **`localFreeBytes`**  | <code>number</code> |
| **`driveFreeBytes`**  | <code>number</code> |
| **`driveLimitBytes`** | <code>number</code> |


#### RemoteBackup

Backup stored in Google Drive.

| Prop            | Type                                                            | Description                                                  |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| **`id`**        | <code>string</code>                                             |                                                              |
| **`name`**      | <code>string</code>                                             |                                                              |
| **`bytes`**     | <code>number</code>                                             |                                                              |
| **`createdAt`** | <code>string</code>                                             | Creation date in ISO 8601 (UTC), assigned by Drive.          |
| **`metadata`**  | <code><a href="#record">Record</a>&lt;string, string&gt;</code> | Metadata the app set when uploading. Empty if there is none. |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### EventMap

Event names and their payloads. Used by `addListener` and by the use cases.

| Prop           | Type                                                    |
| -------------- | ------------------------------------------------------- |
| **`state`**    | <code><a href="#stateevent">StateEvent</a></code>       |
| **`progress`** | <code><a href="#progressevent">ProgressEvent</a></code> |
| **`warning`**  | <code><a href="#warningevent">WarningEvent</a></code>   |
| **`error`**    | <code><a href="#errorevent">ErrorEvent</a></code>       |
| **`log`**      | <code><a href="#logevent">LogEvent</a></code>           |


#### StateEvent

Emitted when an operation changes phase.

| Prop              | Type                                                      |
| ----------------- | --------------------------------------------------------- |
| **`operationId`** | <code>string</code>                                       |
| **`phase`**       | <code><a href="#operationphase">OperationPhase</a></code> |


#### ProgressEvent

Events measuring progress of an underlying process, like an HTTP request (for an XMLHttpRequest, or the loading of the underlying resource of an &lt;img&gt;, &lt;audio&gt;, &lt;video&gt;, &lt;style&gt; or &lt;link&gt;).

| Prop                   | Type                 | Description                                                   |
| ---------------------- | -------------------- | ------------------------------------------------------------- |
| **`lengthComputable`** | <code>boolean</code> |                                                               |
| **`loaded`**           | <code>number</code>  |                                                               |
| **`target`**           | <code>T</code>       | Returns the object to which event is dispatched (its target). |
| **`total`**            | <code>number</code>  |                                                               |


#### WarningEvent

Non-fatal situation: the operation keeps going.

| Prop              | Type                                              |
| ----------------- | ------------------------------------------------- |
| **`operationId`** | <code>string</code>                               |
| **`code`**        | <code><a href="#errorcode">ErrorCode</a></code>   |
| **`parameters`**  | <code><a href="#parameters">Parameters</a></code> |


#### ErrorEvent

Events providing information related to errors in scripts or in files.

| Prop           | Type                |
| -------------- | ------------------- |
| **`colno`**    | <code>number</code> |
| **`error`**    | <code>any</code>    |
| **`filename`** | <code>string</code> |
| **`lineno`**   | <code>number</code> |
| **`message`**  | <code>string</code> |


#### LogEvent

Debug message. Only emitted when `configure` asks for a log level.

| Prop          | Type                                                |
| ------------- | --------------------------------------------------- |
| **`level`**   | <code>'error' \| 'warn' \| 'info' \| 'debug'</code> |
| **`origin`**  | <code>string</code>                                 |
| **`message`** | <code>string</code>                                 |


### Type Aliases


#### LogLevel

Detail level of `log` events.

<code>'silent' | 'info' | 'debug'</code>


#### Record

Construct a type with a set of properties K of type T

<code>{
 [P in K]: T;
 }</code>


#### EventName

<code>keyof <a href="#eventmap">EventMap</a></code>


#### OperationPhase

Phase a long-running operation is in. Emitted as a `state` event.

<code>'preparing' | 'checking-space' | 'compressing' | 'uploading' | 'downloading' | 'verifying' | 'done' | 'cancelled'</code>


#### ErrorCode

<code>keyof typeof ERROR_CODES</code>


#### Parameters

Obtain the parameters of a function type in a tuple

<code>T extends (...args: infer P) =&gt; any ? P : never</code>

</docgen-api>

## Contributing

Pull requests and issues are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development commands. Code, comments and documentation are written in English.

## License

[MIT](LICENSE)
