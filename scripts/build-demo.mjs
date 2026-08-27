/**
 * Bundle the demo into one self-contained HTML file.
 *
 * Everything — markup shell, styles, and the bundled TypeScript — is inlined,
 * so the output opens by double-click from the filesystem, works offline, can be
 * emailed as an attachment, or dropped on GitHub Pages unchanged.
 *
 *   node scripts/build-demo.mjs
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
const outFile = join(projectRoot, 'demo', 'kaskaadhankija-demo.html');

const TITLE = 'Kaskaadhankija — kaskaad-minihanke näidis';
const DESCRIPTION =
  'Tööseisundis näidis kaskaad-minihanke protsessist raamlepingu „Eesti.ai koolitajate tellimine“ alusel.';

function escapeForScript(js) {
  // A literal </script> inside the bundle would close the tag early.
  return js.replace(/<\/script>/gi, '<\\/script>');
}

async function main() {
  const result = await build({
    entryPoints: [join(projectRoot, 'src', 'demo', 'main.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: true,
    legalComments: 'none',
    logLevel: 'info',
  });

  const [bundle] = result.outputFiles;
  const js = escapeForScript(bundle.text);
  const css = await readFile(join(projectRoot, 'src', 'demo', 'styles.css'), 'utf8');

  const html = `<!doctype html>
<html lang="et">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<meta name="description" content="${DESCRIPTION}" />
<title>${TITLE}</title>
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<noscript>
  <div style="max-width:640px;margin:60px auto;padding:0 20px;font-family:system-ui,sans-serif">
    <h1>Kaskaadhankija — näidis</h1>
    <p>See näidis vajab töötamiseks JavaScripti. Palun luba JavaScript ja laadi leht uuesti.</p>
  </div>
</noscript>
<script>
${js}
</script>
</body>
</html>
`;

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`\nWrote ${outFile} (${kb} kB, self-contained)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
