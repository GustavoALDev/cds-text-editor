// @vitest-environment jsdom
// Cobertura do fixture (spec 03b, §7.3): tudo o que o esquema padrão permite
// aparece no fixture, e nada além disso, salvo as exceções declaradas.
import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from '../../src/schema/get-html-schema';
import { readFixture } from './testing/fixtures';
import { collectUsage, schemaUsage } from './testing/schema-usage';

/** O editor nunca produz `caption` (legenda de tabela) nem `thead` (§4). */
const EXCEPTIONS = ['caption', 'thead'];

describe('cobertura do fixture all-features', () => {
  it('uso do fixture ∪ exceções = esquema padrão', () => {
    const schema = getHtmlSchema();
    const used = collectUsage(readFixture('all-features.html'), schema);
    for (const e of EXCEPTIONS) used.add(e);
    const allowed = schemaUsage(schema);
    const missing = [...allowed].filter((k) => !used.has(k)).sort();
    const extra = [...used].filter((k) => !allowed.has(k)).sort();
    expect(
      { missing, extra },
      `faltam no fixture: ${missing.join(', ') || '—'}; fora do esquema: ${extra.join(', ') || '—'}`,
    ).toEqual({ missing: [], extra: [] });
  });

  it('collectUsage separa classe de values, padrão e estilo', () => {
    const keys = collectUsage(
      '<pre><code class="language-go">x</code></pre><p class="rt-x" style="text-align: left">y</p>',
    );
    expect([...keys].sort()).toEqual([
      'code',
      'code~^language-[a-z0-9][a-z0-9+#-]{0,29}$',
      'p',
      'p.rt-x',
      'pre',
      'p{text-align}',
    ]);
  });
});
