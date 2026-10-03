// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getHtmlSchema, isAllowedClass } from '../../src/index';
import { defineCodeLanguage, RTE_CODE_LANGUAGES } from './index';

const IDS = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'markdown',
  'php',
  'python',
  'ruby',
  'rust',
  'scss',
  'shell',
  'sql',
  'swift',
  'typescript',
  'yaml',
];
const ALIASES: Record<string, string[]> = {
  bash: ['sh'],
  cpp: ['c++'],
  csharp: ['cs'],
  go: ['golang'],
  html: ['xml', 'xhtml'],
  javascript: ['js', 'jsx', 'mjs'],
  kotlin: ['kt'],
  markdown: ['md'],
  python: ['py'],
  ruby: ['rb'],
  rust: ['rs'],
  typescript: ['ts', 'tsx'],
  yaml: ['yml'],
};
const PATTERN = /^[a-z0-9][a-z0-9+#-]{0,29}$/;
const ok = () => Promise.resolve((() => ({ contains: [] })) as never);

describe('RTE_CODE_LANGUAGES', () => {
  it('ids na ordem da spec', () => {
    expect(RTE_CODE_LANGUAGES.map((l) => l.id)).toEqual(IDS);
  });

  it('aliases exatamente os da spec', () => {
    for (const l of RTE_CODE_LANGUAGES) {
      expect([...l.aliases]).toEqual(ALIASES[l.id] ?? []);
    }
  });

  it('ids e aliases sem repetição e casando o padrão', () => {
    const all = RTE_CODE_LANGUAGES.flatMap((l) => [l.id, ...l.aliases]);
    expect(new Set(all).size).toBe(all.length);
    for (const t of all) expect(t).toMatch(PATTERN);
  });

  it('ids e aliases passam a regra de classe da 03a', () => {
    const code = getHtmlSchema({ features: { code: true } }).elements['code']!;
    for (const l of RTE_CODE_LANGUAGES) {
      for (const t of [l.id, ...l.aliases]) {
        expect(isAllowedClass(code, `language-${t}`)).toBe(true);
      }
    }
  });

  it('congelado em profundidade', () => {
    expect(Object.isFrozen(RTE_CODE_LANGUAGES)).toBe(true);
    for (const l of RTE_CODE_LANGUAGES) {
      expect(Object.isFrozen(l)).toBe(true);
      expect(Object.isFrozen(l.aliases)).toBe(true);
    }
  });

  it('html carrega a gramática xml', async () => {
    const html = RTE_CODE_LANGUAGES.find((l) => l.id === 'html')!;
    const xml = (await import('highlight.js/lib/languages/xml')).default;
    expect(await html.load()).toBe(xml);
  });

  it('cada load devolve uma função de gramática', async () => {
    for (const l of RTE_CODE_LANGUAGES) {
      expect(typeof (await l.load())).toBe('function');
    }
  });

  it('a fonte não importa gramática no topo', () => {
    const src = readFileSync(new URL('./catalog.ts', import.meta.url), 'utf8');
    const statics = src
      .split('\n')
      .filter((x) => /^import\b/.test(x) && x.includes('highlight.js'));
    for (const x of statics) expect(x).toMatch(/^import type /);
    expect(src.split("import('highlight.js/lib/languages/").length - 1).toBe(
      24,
    );
  });
});

describe('defineCodeLanguage', () => {
  const base = { id: 'x', name: 'X', aliases: [] as string[], load: ok };

  it('devolve cópia congelada', () => {
    const l = defineCodeLanguage({ ...base, aliases: ['y'] });
    expect(l).not.toBe(base);
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.aliases)).toBe(true);
  });

  it.each([
    ['id maiúsculo', { id: 'JS' }],
    ['id vazio', { id: '' }],
    ['id longo', { id: 'a'.repeat(31) }],
    ['alias inválido', { aliases: ['Bad'] }],
    ['alias igual ao id', { aliases: ['x'] }],
    ['aliases repetidos', { aliases: ['y', 'y'] }],
    ['name vazio', { name: ' ' }],
    ['load não função', { load: 1 }],
  ])('lança TypeError para %s', (_n, patch) => {
    expect(() => defineCodeLanguage({ ...base, ...patch } as never)).toThrow(
      TypeError,
    );
  });
});
