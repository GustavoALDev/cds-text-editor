// @vitest-environment jsdom
// Contrato do HTML (spec 03b, §7.2, lição 9): o fixture "todos os recursos" é
// ponto fixo de `getRteHtml`, a saída é canônica no esquema e o teste falha
// quando uma extensão muda a marcação.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSchema } from '@tiptap/core';
import type { AnyExtension, Editor } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import * as fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RTE_CODE_LANGUAGES } from '../../code-languages/src/index';
import { validateHtml } from '../../html/src/validate-html';
import type { RteHtmlViolation } from '../../html/src/validate-html';
import { DEFAULT_EMBED_PROVIDERS } from '../../src/embeds/providers';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import type {
  RteEmbedProvider,
  RteFeatureId,
  RteHtmlSchema,
} from '../../src/schema/types';
import { createEditorExtensions } from './factory';
import { getSearchState } from './search';
import { getRteHtml, serializeRteHtml } from './serialize';
import { getSlashMenuState } from './slash';
import { normalizeForCompare } from './testing/compare';
import { validDoc } from './testing/doc-arbitraries';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import { typeText } from './testing/type-text';
import { FIXTURE_DIR, readFixture, writeFixture } from './testing/fixtures';
import type { RteEditorOptions } from './types';

const HTML = 'all-features.html';
const JSON_FILE = 'all-features.json';
const CORPUS_FILE = 'editor-corpus.json';
const fixture = readFixture(HTML);
const S = getHtmlSchema();
const BASE: RteEditorOptions = { codeLanguages: RTE_CODE_LANGUAGES };

// Cada teste monta o editor completo com o fixture inteiro; com a suíte toda em
// paralelo, o primeiro chega a passar dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => destroyTestEditors());

function load(options: RteEditorOptions = BASE, extensions?: AnyExtension[]) {
  return createTestEditor(
    options,
    fixture,
    extensions === undefined ? undefined : { extensions },
  );
}

const kinds = (v: RteHtmlViolation[]) => v.map((x) => x.kind);

describe('fixture all-features (ponto fixo)', () => {
  it('o arquivo não tem \\r (checkout com eol=lf)', () => {
    const raw = readFileSync(resolve(FIXTURE_DIR, HTML), 'utf8');
    expect(
      raw.includes('\r'),
      'fixtures/content/all-features.html tem \\r: confira o .gitattributes (eol=lf)',
    ).toBe(false);
    expect(raw.endsWith('\n')).toBe(false);
  });

  it('getRteHtml após setContent é igual byte a byte ao arquivo', () => {
    expect(getRteHtml(load())).toBe(fixture);
  });

  it('a saída é canônica no esquema e os ids de título são únicos', () => {
    const out = getRteHtml(load());
    expect(validateHtml(out, S)).toEqual([]);
    const ids = [...out.matchAll(/<h[234] id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids.length).toBe((out.match(/<h[234][ >]/g) ?? []).length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('rt-titulo-principal-2');
  });

  it('editor.getHTML() é aceito e só difere em ids e na forma do style', () => {
    const editor = load();
    const raw = editor.getHTML();
    expect(validateHtml(raw, S, { mode: 'accepted' })).toEqual([]);
    expect(normalizeForCompare(raw, S, document)).toBe(
      normalizeForCompare(getRteHtml(editor), S, document),
    );
  });
});

/** Aplica `fn` aos atributos de cada elemento da especificação (recursivo). */
function mapSpec(
  spec: DOMOutputSpec,
  fn: (tag: string, attrs: Record<string, unknown>) => string,
): DOMOutputSpec {
  if (!Array.isArray(spec) || typeof spec[0] !== 'string') return spec;
  const [tag, ...rest] = spec as [string, ...unknown[]];
  const first = rest[0];
  const hasAttrs =
    first !== null &&
    typeof first === 'object' &&
    !Array.isArray(first) &&
    !(first instanceof Object && 'nodeType' in first);
  const attrs = hasAttrs ? { ...(first as Record<string, unknown>) } : {};
  const children = (hasAttrs ? rest.slice(1) : rest).map((c) =>
    mapSpec(c as DOMOutputSpec, fn),
  );
  const newTag = fn(tag, attrs);
  return [newTag, attrs, ...children] as unknown as DOMOutputSpec;
}

/** A lista da fábrica com `name` trocada por `.extend()` com `renderHTML` mapeado. */
function mutated(
  name: string,
  fn: (tag: string, attrs: Record<string, unknown>) => string,
): AnyExtension[] {
  const list = createEditorExtensions(BASE);
  let found = false;
  const out = list.map((ext) => {
    if (ext.name !== name) return ext;
    found = true;
    return (
      ext as AnyExtension & { extend: (c: object) => AnyExtension }
    ).extend({
      renderHTML(
        this: { parent?: (p: unknown) => DOMOutputSpec },
        props: unknown,
      ) {
        return mapSpec(this.parent!(props), fn);
      },
    });
  });
  expect(found, `extensão ${name} não está na lista`).toBe(true);
  return out;
}

const MUTATIONS: [
  string,
  RteHtmlViolation['kind'],
  (tag: string, attrs: Record<string, unknown>) => string,
][] = [
  [
    'paragraph',
    'unknown-attribute',
    (tag, a) => {
      if (tag === 'p') a['data-x'] = '1';
      return tag;
    },
  ],
  [
    'rtCallout',
    'invalid-class',
    (tag, a) => {
      if (tag === 'aside') a['class'] = `${String(a['class'])} rt-desconhecida`;
      return tag;
    },
  ],
  ['heading', 'unknown-element', (tag) => (/^h[2-4]$/.test(tag) ? 'h5' : tag)],
  [
    'rtTextColor',
    'invalid-style',
    (tag, a) => {
      if (tag === 'span' && a['style']) a['style'] = 'color: #000000';
      return tag;
    },
  ],
  [
    'link',
    'non-canonical-attribute',
    (tag, a) => {
      if (tag === 'a' && a['rel']) a['rel'] = 'noreferrer noopener';
      return tag;
    },
  ],
  [
    'rtImage',
    'missing-required-attribute',
    (tag, a) => {
      if (tag === 'img') delete a['alt'];
      return tag;
    },
  ],
  [
    'rtEmbed',
    'missing-required-attribute',
    (tag, a) => {
      if (tag === 'iframe') delete a['sandbox'];
      return tag;
    },
  ],
];

describe('mutação: uma extensão modificada faz o contrato falhar', () => {
  it.each(MUTATIONS)('%s → %s', (name, kind, fn) => {
    const out = getRteHtml(load(BASE, mutated(name, fn)));
    expect(kinds(validateHtml(out, S))).toContain(kind);
    expect(out).not.toBe(fixture);
  });
});

describe('esquema mais restrito acusa a saída do fixture', () => {
  it('sem mark → unknown-element', () => {
    const strict = structuredClone(S) as RteHtmlSchema;
    delete (strict.elements as Record<string, unknown>)['mark'];
    expect(kinds(validateHtml(fixture, strict))).toContain('unknown-element');
  });

  it('sem col.styles.width → invalid-style', () => {
    const strict = structuredClone(S) as RteHtmlSchema;
    const col = strict.elements['col'];
    expect(col?.styles?.['width']).toBeDefined();
    delete (col!.styles as Record<string, unknown>)['width'];
    expect(kinds(validateHtml(fixture, strict))).toContain('invalid-style');
  });
});

const CONSUMER: RteEmbedProvider = {
  id: 'exemplo',
  name: 'Exemplo',
  hosts: ['embed.exemplo.com.br'],
  srcPatterns: ['^https://embed\\.exemplo\\.com\\.br/v/[0-9]{1,8}$'],
  match: (url) =>
    /^https:\/\/embed\.exemplo\.com\.br\/v\/[0-9]{1,8}$/.test(url),
  toEmbed: (url) => (CONSUMER.match(url) ? { src: url } : null),
};

describe('recursos desligados e variações de opção', () => {
  const OFF: RteFeatureId[] = [
    'colors',
    'code',
    'tables',
    'tasks',
    'media',
    'embeds',
    'newsBlocks',
  ];

  it.each(OFF)('%s desligado: saída sem violação no esquema reduzido', (r) => {
    const options = { features: { [r]: false } };
    const out = getRteHtml(load({ ...BASE, ...options }));
    expect(validateHtml(out, getHtmlSchema(options))).toEqual([]);
    expect(out).not.toBe(fixture);
  });

  it.each<[string, RteEditorOptions]>([
    ['idPrefix doc-', { idPrefix: 'doc-' }],
    ['embedProviders []', { embedProviders: [] }],
    [
      'provedor do consumidor',
      { embedProviders: [...DEFAULT_EMBED_PROVIDERS, CONSUMER] },
    ],
  ])('%s: saída sem violação', (_, options) => {
    const out = getRteHtml(load({ ...BASE, ...options }));
    const { codeLanguages: _codeLanguages, ...schemaOptions } = {
      ...BASE,
      ...options,
    };
    expect(validateHtml(out, getHtmlSchema(schemaOptions))).toEqual([]);
  });

  it('idPrefix doc- troca o prefixo de todos os ids', () => {
    const out = getRteHtml(load({ ...BASE, idPrefix: 'doc-' }));
    expect(out).toContain('<h2 id="doc-titulo-principal"');
    expect(out).not.toContain('id="rt-');
  });

  it('o provedor do consumidor convive com os padrão', () => {
    const editor = load({
      ...BASE,
      embedProviders: [...DEFAULT_EMBED_PROVIDERS, CONSUMER],
    });
    expect(getRteHtml(editor)).toBe(fixture);
  });
});

describe('all-features.json (drift)', () => {
  it('editor.getJSON() do fixture está em dia', () => {
    const json = `${JSON.stringify(load().getJSON(), null, 2)}\n`;
    if (process.env['UPDATE_FIXTURES'] === '1') {
      writeFixture(JSON_FILE, json);
      return;
    }
    expect(
      readFixture(JSON_FILE) === json,
      'fixtures/content/all-features.json está desatualizado: regenere com `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache`',
    ).toBe(true);
  });
});

describe('editor-corpus.json (drift)', () => {
  // 300 documentos válidos serializados pelo editor: o sanitizador (spec 04)
  // os lê como JSON e confere que cada um é ponto fixo (R2).
  const schema = getSchema(createEditorExtensions());
  const docs = fc
    .sample(validDoc, { numRuns: 300, seed: 20261003 })
    .map((json) => serializeRteHtml(schema.nodeFromJSON(json)));

  it('cada documento é canônico no esquema', () => {
    expect(docs).toHaveLength(300);
    docs.forEach((doc, i) => {
      expect(validateHtml(doc, S), `documento ${i}`).toEqual([]);
    });
  });

  it('o corpus gravado está em dia', () => {
    const json = `${JSON.stringify(docs, null, 2)}
`;
    if (process.env['UPDATE_FIXTURES'] === '1') {
      writeFixture(CORPUS_FILE, json);
      return;
    }
    expect(
      readFixture(CORPUS_FILE) === json,
      'fixtures/content/editor-corpus.json está desatualizado: regenere com `UPDATE_FIXTURES=1 npx nx test core --skip-nx-cache`',
    ).toBe(true);
  });
});

describe('nada da 03c chega ao HTML (R7, C19)', () => {
  it('com busca ativa, getRteHtml continua igual ao arquivo', () => {
    const editor = load();
    editor.commands.setSearchQuery('a');
    expect(getSearchState(editor)?.total).toBeGreaterThan(0);
    expect(getRteHtml(editor)).toBe(fixture);
  });

  const WITHOUT = ['rtSearch', 'rtSlashCommand', 'rtPlaceholder'];

  function pair(options: RteEditorOptions, act?: (editor: Editor) => void) {
    const full = createTestEditor(options, '<p></p>');
    act?.(full);
    const list = createEditorExtensions(options).filter(
      (e) => !WITHOUT.includes(e.name),
    );
    const bare = createTestEditor(options, '<p></p>', { extensions: list });
    act?.(bare);
    return { full, bare };
  }

  it('menu / aberto: HTML igual ao de um editor sem as extensões', () => {
    const { full, bare } = pair({}, (editor) => {
      editor.commands.focus();
      typeText(editor, '/');
    });
    expect(getSlashMenuState(full).open).toBe(true);
    expect(getRteHtml(full)).toBe(getRteHtml(bare));
    expect(full.getHTML()).toBe(bare.getHTML());
    expect(getRteHtml(full)).not.toContain('rte-');
  });

  it('documento vazio com placeholder: HTML igual e sem atributos', () => {
    const { full, bare } = pair({ placeholder: 'P' });
    expect(getRteHtml(full)).toBe(getRteHtml(bare));
    expect(full.getHTML()).toBe(bare.getHTML());
    for (const out of [getRteHtml(full), full.getHTML()]) {
      expect(out).not.toContain('rte-');
      expect(out).not.toContain('data-placeholder');
      expect(out).not.toContain('aria-placeholder');
    }
  });
});
