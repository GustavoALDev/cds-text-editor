import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getHtmlSchema } from './get-html-schema';
import { renderHtmlSchemaMarkdown } from './markdown';

const DOC = resolve(__dirname, '../../../../docs/html-schema.md');
const md = renderHtmlSchemaMarkdown(getHtmlSchema());

describe('docs/html-schema.md', () => {
  it('está em dia com o esquema', () => {
    if (process.env['UPDATE_SCHEMA_DOC'] === '1') {
      writeFileSync(DOC, md);
      return;
    }
    const atual = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');
    expect(
      atual === md,
      'docs/html-schema.md está desatualizado. Regenere com: UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache',
    ).toBe(true);
  });

  it('é determinístico e traz classes, hosts e cores do esquema', () => {
    expect(renderHtmlSchemaMarkdown(getHtmlSchema())).toBe(md);
    expect(md).toContain('rt-callout--warning');
    expect(md).toContain('youtube-nocookie');
    expect(md).toContain('#b3261e');
  });
});
