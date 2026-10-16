import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist');
const target = join(root, 'www');
if (!target.startsWith(root + sep) || target === root) throw new Error('Unsafe build target');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
const bundle = await rollup({
  input: join(root, 'src', 'native-bridge.js'),
  plugins: [nodeResolve({ browser: true, preferBuiltins: false })]
});
await bundle.write({ file: join(target, 'native-bridge.js'), format: 'es', inlineDynamicImports: true });
await bundle.close();
console.log('Prepared Capacitor web assets in www/');
