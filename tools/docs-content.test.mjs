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
    const index = JSON.parse(
      readFileSync(join(out, 'search-index.json'), 'utf8'),
    );
    assert.ok(
      index.some(
        (e) => e.page === 'guia/pagina-minima' && e.anchor === 'detalhes',
      ),
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

function pipelineRepo(md) {
  const { root, content } = repo();
  const ex = join(root, 'apps', 'docs', 'examples');
  mkdirSync(ex, { recursive: true });
  cpSync(join(FIX, 'exemplo.ts'), join(ex, 'exemplo.ts'));
  writeFileSync(
    join(ex, 'registry.ts'),
    "export const EXAMPLES = {\n  demo: () => import('./demo'),\n};\n",
  );
  writeFileSync(join(content, 'guia', 'pagina-minima.md'), md);
  return root;
}

const pageOf = (out, id) =>
  JSON.parse(
    readFileSync(join(out, 'pages', `${id}.ts`), 'utf8')
      .replace(/^export default /, '')
      .replace(/;\s*$/, ''),
  );

test('docs-content: example, live e no-compile viram segmentos; contrato nav.ts/pages.ts do app', () => {
  const root = pipelineRepo(
    [
      '# Página',
      '',
      '## Uso',
      '',
      '<!-- example: examples/exemplo.ts#uso -->',
      '',
      '<!-- live: demo -->',
      '',
      '<!-- no-compile: saída -->',
      '```text',
      'ok',
      '```',
      '',
    ].join('\n'),
  );
  const out = join(root, 'out');
  try {
    main({ repoRoot: root, out });
    const page = pageOf(out, 'guia-pagina-minima');
    assert.equal(page.segments.length, 3);
    assert.match(page.segments[0].html, /hljs-keyword/);
    assert.match(page.segments[0].html, /resumo/);
    assert.deepEqual(page.segments[1], { live: 'demo' });
    assert.match(page.segments[2].html, /language-text/);
    // contrato consumido por apps/docs (T2): NAV com { path, title } e PAGES com import()
    const nav = readFileSync(join(out, 'nav.ts'), 'utf8');
    assert.match(nav, /^export const NAV: readonly [{]/);
    assert.match(nav, /"path": "guia\/pagina-minima"/);
    assert.ok(nav.endsWith('];\n'));
    assert.equal(
      readFileSync(join(out, 'pages.ts'), 'utf8'),
      'export const PAGES = {\n  "guia/pagina-minima": () => import(\'./pages/guia-pagina-minima\'),\n} as const;\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs-content: HTML proibido, bloco sem diretiva e live inexistente falham o build', () => {
  const cases = [
    ['# P\n\nTexto <script>alert(1)</script>\n', /HTML não permitido/],
    ['# P\n\n[x](javascript:alert(1))\n', /javascript:/],
    ['# P\n\n```ts\nx\n```\n', /bloco de código sem diretiva/],
    ['# P\n\n<!-- live: nada -->\n', /exemplo vivo "nada"/],
    ['# P\n\n<!-- example: examples/exemplo.ts#nada -->\n', /região "nada"/],
  ];
  for (const [md, re] of cases) {
    const root = pipelineRepo(md);
    try {
      assert.throws(
        () => main({ repoRoot: root, out: join(root, 'o') }),
        re,
        md,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('docs-content: páginas de API entram na nav e são geradas por entry', () => {
  const root = pipelineRepo('# P\n');
  const api = join(root, 'api');
  mkdirSync(api);
  writeFileSync(
    join(api, 'rte-core.md'),
    '<!-- Do not edit this file. It is automatically generated by API Documenter. -->\n\n[Home](./index.md)\n\n## rte-core package\n\n## Functions\n\n',
  );
  const pkg = (name, exportsMap) => ({ name, exports: exportsMap });
  const packages = {
    core: pkg('@comodeviaser/rte-core', { '.': { types: './x.d.ts' } }),
    sanitizer: pkg('@comodeviaser/rte-sanitizer', {}),
    theme: pkg('@comodeviaser/rte-theme', {}),
    angular: pkg('@comodeviaser/rte-angular', {}),
    render: pkg('@comodeviaser/rte-render', {}),
  };
  const out = join(root, 'out');
  try {
    const r = main({ repoRoot: root, out, apiDir: api, packages });
    assert.deepEqual(r.pages, ['guia/pagina-minima', 'api/core']);
    assert.equal(r.nav.sections.at(-1).title, 'Referência da API');
    assert.match(
      readFileSync(join(out, 'nav.ts'), 'utf8'),
      /"path": "api\/core"/,
    );
    assert.equal(pageOf(out, 'api-core').title, '@comodeviaser/rte-core');
    // entry publicado sem arquivo do api-documenter falha
    packages.theme = pkg('@comodeviaser/rte-theme', { '.': { types: './t.d.ts' } });
    assert.throws(
      () => main({ repoRoot: root, out, apiDir: api, packages }),
      /rte-theme\.md/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs-content: índice de busca acima de 400 KB falha o build', () => {
  const { root, content } = repo();
  const secao = (n) => `## Seção ${n}\n\n${'palavra '.repeat(120)}\n`;
  const big = Array.from({ length: 900 }, (_, n) => secao(n)).join('\n');
  writeFileSync(join(content, 'guia', 'pagina-minima.md'), `# P\n\n${big}`);
  try {
    assert.throws(
      () => main({ repoRoot: root, out: join(root, 'o') }),
      /search-index\.json tem .* KB, acima do teto/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const README_SRC = [
  '# Raiz',
  '',
  '<!-- readme: example examples/exemplo.ts#interno -->',
  '<!-- /readme -->',
  '',
  '<!-- readme: generated install-command -->',
  '<!-- /readme -->',
  '',
  'Fim.',
].join('\n');

const README_PACKAGES = {
  angular: {
    name: '@comodeviaser/rte-angular',
    peerDependencies: { '@comodeviaser/rte-core': '0.0.0' },
  },
};

test('docs-content: README raiz diverge sem UPDATE_README falha com a diferença; com ele reescreve', () => {
  const root = pipelineRepo('# P\n');
  const readme = join(root, 'README.md');
  writeFileSync(readme, README_SRC);
  const out = join(root, 'out');
  try {
    assert.throws(
      () =>
        main({ repoRoot: root, out, packages: README_PACKAGES, updateReadme: false }),
      /README\.md:4: o conteúdo gerado difere.*UPDATE_README=1/s,
    );
    assert.equal(readFileSync(readme, 'utf8'), README_SRC);
    main({ repoRoot: root, out, packages: README_PACKAGES, updateReadme: true });
    const written = readFileSync(readme, 'utf8');
    assert.match(
      written,
      /<!-- readme: example examples\/exemplo\.ts#interno -->\n```ts\nconst texto = htmlToText\(html\);\n```\n<!-- \/readme -->/,
    );
    assert.match(
      written,
      /```bash\nnpm install @comodeviaser\/rte-angular @comodeviaser\/rte-core\n```/,
    );
    assert.ok(written.endsWith('\nFim.'));
    // agora confere sem reescrever
    main({ repoRoot: root, out, packages: README_PACKAGES, updateReadme: false });
    assert.equal(readFileSync(readme, 'utf8'), written);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs-content: README ausente, sem marcadores ou com readme: false não faz nada', () => {
  const root = pipelineRepo('# P\n');
  const out = join(root, 'out');
  try {
    main({ repoRoot: root, out, updateReadme: true });
    writeFileSync(join(root, 'README.md'), '# Sem marcadores\n');
    main({ repoRoot: root, out, updateReadme: false });
    writeFileSync(join(root, 'README.md'), README_SRC);
    main({ repoRoot: root, out, readme: false, updateReadme: false });
    assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), README_SRC);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('docs-content: marcador do README com região ausente falha citando o arquivo', () => {
  const root = pipelineRepo('# P\n');
  writeFileSync(
    join(root, 'README.md'),
    '<!-- readme: example examples/exemplo.ts#nada -->\n<!-- /readme -->\n',
  );
  try {
    assert.throws(
      () => main({ repoRoot: root, out: join(root, 'o'), updateReadme: false }),
      /README\.md:1: .*região "nada" não encontrada/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('buildNav: quatro grupos do guia na ordem, a API depois; página fora da nav falha', () => {
  const grupos = ['Começar', 'Usar', 'Operar', 'Referência'];
  const nav = {
    sections: grupos.map((title, i) => ({
      title,
      items: [{ page: `guia/p${i}`, title: `P${i}` }],
    })),
  };
  const pages = grupos.map((_, i) => ({ id: `guia/p${i}` }));
  const built = buildNav(
    { sections: [...nav.sections, { title: 'Referência da API', items: [] }] },
    pages,
  );
  assert.deepEqual(
    built.sections.map((s) => s.title),
    [...grupos, 'Referência da API'],
  );
  assert.throws(
    () => buildNav(nav, [...pages, { id: 'guia/extra' }]),
    /guia\/extra.*não está no nav\.json/,
  );
});
