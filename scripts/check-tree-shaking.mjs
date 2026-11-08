// Bundles a consumer that imports only public values from the built package and checks that the
// main chunk does not carry the web implementation or the Drive REST client.
// Requires `npm run build` first.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entryModule = join(root, 'dist', 'esm', 'index.js');

const dir = mkdtempSync(join(tmpdir(), 'gdb-tree-'));
const consumer = join(dir, 'consumer.mjs');
writeFileSync(consumer, `import { ERROR_CODES } from '${entryModule}';\nexport default ERROR_CODES;\n`);

const bundle = await rollup({ input: consumer, external: ['@capacitor/core'] });
const { output } = await bundle.generate({ format: 'es', dir: join(dir, 'out') });
await bundle.close();

const main = output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry);
const forbidden = ['DriveRestClient', 'xhrTransport', 'GisAuth', 'GoogleDriveBackupsWeb', 'WebLocalStorage'];
const leaked = forbidden.filter((name) => main.code.includes(name));

if (leaked.length > 0) {
  console.error(`check-tree-shaking: the main chunk still contains: ${leaked.join(', ')}`);
  process.exit(1);
}

const chunks = output
  .filter((chunk) => chunk.type === 'chunk')
  .map((chunk) => `${chunk.fileName} (${chunk.code.length} chars)`);
console.log(`check-tree-shaking: OK. Chunks: ${chunks.join(', ')}`);
