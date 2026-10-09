// Conteúdo dos documentos de política (09c T5a): versionamento conjunto, faixas de suporte e seções.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(root, p), 'utf8');

test('docs/support.md: versionamento conjunto, sem pre enter', () => {
  const t = ler('docs/support.md');
  assert.doesNotMatch(t, /independente por pacote/i);
  assert.doesNotMatch(t, /pre enter/i);
});

test('docs/support.md: faixas de suporte', () => {
  const t = ler('docs/support.md');
  assert.ok(t.includes('>=22.2.1 <23'));
  assert.ok(t.includes('^3.31.4'));
});

test('docs/support.md: seções obrigatórias', () => {
  const t = ler('docs/support.md');
  for (const s of ['API pública', 'Depreciação', 'Terceiros', 'Angular']) {
    assert.match(t, new RegExp(`^##+ .*${s}`, 'm'), `falta a seção "${s}"`);
  }
});

test('changeset README e CONTRIBUTING não dizem "versão independente"', () => {
  for (const f of ['.changeset/README.md', 'CONTRIBUTING.md']) {
    assert.doesNotMatch(ler(f), /vers[ãa]o independente/i, f);
  }
});
