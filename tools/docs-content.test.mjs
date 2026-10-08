import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from './docs-content.mjs';
import { buildNav } from './docs/nav.mjs';
import { slug, uniqueSlugs } from './docs/slug.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'docs');

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'docs-content-'));
  const content = join(root, 'apps', 'docs', 'content');
  mkdirSync(join(content, 'guia'), { recursive: true });
  cpSync(join(FIX, 'nav.json'), join(content, 'nav.json'));
  cpSync(
    join(FIX, 'pagina-minima.md'),
    join(content, 'guia', 'pagina-minima.md'),
  );
  return { root, content };
}

test('slug: acentos removidos, ASCII, hífens', () => {
  assert.equal(slug('Configuração e opções'), 'configuracao-e-opcoes');
  assert.equal(slug('  `provideRichText()`  '), 'providerichtext');
});

test('uniqueSlugs: devolve slugs; colisão falha em pt-BR citando a página', () => {
  assert.deepEqual(uniqueSlugs(['A', 'B'], 'guia/x'), ['a', 'b']);
  assert.throws(
    () => uniqueSlugs(['A', 'A', 'Á'], 'guia/x'),
    /página guia\/x: âncora duplicada "a"/,
  );
});

test('buildNav: ordem e títulos da nav.json; ausente ou fora da nav falha', () => {
  const nav = {
    sections: [
      {
        title: 'Guia',
        items: [
          { page: 'guia/b', title: 'B!' },
          { page: 'guia/a', title: 'A!' },
        ],
      },
    ],
  };
  const pages = [{ id: 'guia/a' }, { id: 'guia/b' }];
  assert.deepEqual(
    buildNav(nav, pages).sections[0].items.map((i) => i.title),
    ['B!', 'A!'],
  );
  assert.throws(() => buildNav(nav, [{ id: 'guia/a' }]), /guia\/b.*não existe/);
  assert.throws(
    () => buildNav(nav, [...pages, { id: 'guia/c' }]),
    /guia\/c.*não está no nav\.json/,
  );
});

test('docs-content: grava páginas, nav.ts e JSON vazios válidos na pasta injetada', () => {
  const { root } = repo();
  const out = mkdtempSync(join(tmpdir(), 'docs-content-out-'));
  try {
    const r = main({ repoRoot: root, out });
    assert.deepEqual(r.pages, ['guia/pagina-minima']);
    const page = readFileSync(
      join(out, 'pages', 'guia-pagina-minima.ts'),
      'utf8',
    );
    assert.match(page, /^export default \{/);
    const mod = JSON.parse(
      page.replace(/^export default /, '').replace(/;\s*$/, ''),
    );
    assert.equal(mod.title, 'Página mínima');
    assert.equal(mod.description, 'Fixture do esqueleto do docs-content.');
    assert.deepEqual(mod.headings, [
      { depth: 2, text: 'Configuração e opções', id: 'configuracao-e-opcoes' },
      { depth: 3, text: 'Detalhes', id: 'detalhes' },
    ]);
    assert.ok(Array.isArray(mod.segments));
    assert.match(
      readFileSync(join(out, 'nav.ts'), 'utf8'),
      /guia\/pagina-minima/,
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(out, 'search-index.json'), 'utf8')),
      [],
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(out, 'links.json'), 'utf8')),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('docs-content: título duplicado na página falha o build', () => {
  const { root, content } = repo();
  writeFileSync(
    join(content, 'guia', 'pagina-minima.md'),
    '# T\n\n## Á\n\n## A\n',
  );
  try {
    assert.throws(
      () => main({ repoRoot: root, out: join(root, 'o') }),
      /âncora duplicada "a"/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
