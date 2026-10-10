import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertIndexSize,
  buildSearchIndex,
  normalize,
  shortTitle,
} from './docs/search-index.mjs';

const pages = [
  {
    id: 'guia/configuracao',
    title: 'Configuração',
    segments: [
      {
        html: '<p>Introdução &amp; visão geral.</p><h2 id="providers">Providers</h2><p>Use <code>provideRichText</code>.</p><h3 id="opcoes-avancadas">Opções avançadas</h3><p>Texto <b>forte</b>.</p>',
      },
      { live: 'ignorado' },
    ],
  },
  {
    id: 'api/rte-core',
    title: 'rte-core',
    segments: [{ html: '<h2 id="extracttoc">extractToc</h2><p>Extrai.</p>' }],
  },
];

test('normalize remove diacríticos e põe em minúsculas', () => {
  assert.equal(normalize('Configuração À'), 'configuracao a');
});

test('uma entrada por seção h2/h3, com introdução e texto normalizado', () => {
  const idx = buildSearchIndex(pages);
  assert.deepEqual(
    idx.map((e) => [e.page, e.anchor, e.title]),
    [
      ['guia/configuracao', '', 'Configuração'],
      ['guia/configuracao', 'providers', 'Providers'],
      ['guia/configuracao', 'opcoes-avancadas', 'Opções avançadas'],
      ['api/rte-core', 'extracttoc', 'extractToc'],
    ],
  );
  assert.equal(idx[0].text, 'introducao & visao geral.');
  assert.equal(idx[1].text, 'use providerichtext.');
  assert.equal(idx[2].text, 'texto forte.');
  assert.equal(idx[3].pageTitle, 'rte-core');
});

test('pageTitle da API sai sem o escopo npm', () => {
  const [entry] = buildSearchIndex([
    {
      id: 'api/rte-core',
      title: '@comodeviaser/rte-core',
      segments: [{ html: '<h2 id="x">x</h2><p>y</p>' }],
    },
  ]);
  assert.equal(entry.pageTitle, 'rte-core');
  assert.equal(shortTitle('Configuração'), 'Configuração');
});

test('assertIndexSize falha acima do teto, em pt-BR', () => {
  assert.doesNotThrow(() => assertIndexSize('[]', 10));
  assert.throws(
    () => assertIndexSize('x'.repeat(401 * 1024)),
    /acima do teto de 400 KB/,
  );
  assert.throws(() => assertIndexSize('ã'.repeat(6), 10), /teto/);
});
