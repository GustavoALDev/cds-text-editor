// Guarda contra TDZ nos bundles publicados (bug achado pelo demo, spec 07b): um consumidor
// que roda os testes sem o linker do Angular (Vitest) avalia os `fesm2022/*.mjs` como estão, e
// uma `contentChildren(Classe)` com a classe declarada depois no mesmo módulo vira
// `ReferenceError: Cannot access 'X' before initialization`. Aqui cada fesm do dist é importado
// em Node puro, só com o compilador JIT carregado antes (o que o consumidor também tem).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const PACOTES = ['angular', 'render'];

const fesms = PACOTES.flatMap((pkg) => {
  const dir = resolve(ROOT, 'dist/packages', pkg, 'fesm2022');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => ({ pkg, file: f, path: resolve(dir, f) }));
});

// `RTE_REQUIRE_DIST=1` (o job `demo` do CI, depois do build) transforma a ausência do dist em
// falha; sem ele o teste é pulado (o `test:tools` do job `verify` roda antes de qualquer build).
test('há bundles fesm no dist para avaliar (rode o build antes)', (t) => {
  if (fesms.length > 0) return;
  const message = 'dist/packages/{angular,render}/fesm2022 não existe';
  if (process.env.RTE_REQUIRE_DIST) assert.fail(`${message}: rode o build antes`);
  t.skip(message);
});

await import('@angular/compiler');

for (const { pkg, file, path } of fesms) {
  test(`${pkg}/${file} avalia em Node sem o linker (sem TDZ)`, async () => {
    try {
      await import(pathToFileURL(path).href);
    } catch (e) {
      assert.ok(
        !(e instanceof ReferenceError),
        `ReferenceError ao avaliar ${pkg}/${file}: ${e.message}`,
      );
      throw e;
    }
  });
}
