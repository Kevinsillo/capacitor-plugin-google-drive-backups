# Contributing

Thanks for helping improve this plugin. Bug reports, feature requests and pull requests are welcome. Please use the issue templates so we have what we need to reproduce a problem.

The project is maintained on a best-effort basis (see the README). Keep changes focused, and include tests for behaviour changes.

## Development setup

1. Fork and clone the repository.
2. Install the dependencies:

   ```shell
   npm install
   ```

3. For the Android tests you need JDK 21. Gradle does not run with JDK 17 because the module targets Java 21:

   ```shell
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
   ```

   The Android SDK must be available through `ANDROID_HOME` (or a `local.properties` file in `android/`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Runs the Vitest suite (TypeScript domain, application and infrastructure). |
| `npm run typecheck` | Type-checks all sources and tests without emitting files. |
| `npm run build` | Regenerates the API docs (`docgen`), compiles `src/` to `dist/esm/` and bundles `dist/plugin.js`. |
| `npm run watch` | Compiles `src/` on every change. |
| `npm run lint` | ESLint and Prettier checks. |
| `npm run fmt` | Applies the ESLint and Prettier fixes. |
| `npm run verify` | Runs the Gradle tests and the web build. |

Gradle tests can also be run directly from `android/` with `./gradlew test`.

## Documentation

The API section of the README is generated from the JSDoc comments in `src/definitions.ts`. Edit the comments and run `npm run build`; do not edit the generated block by hand. The text around the generated block is written by hand.

## Language

Code, comments, documentation, file names and test names are written in English.

## Pull requests

- Keep the test suites green: `npm test`, `npm run typecheck`, `npm run lint` and `./gradlew test`.
- Describe what changes for users of the plugin, and whether it affects the public API or the error catalog.
- Do not change the error code catalog (`ERROR_CODES`) without updating the README.
