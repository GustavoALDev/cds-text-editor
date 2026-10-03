// @vitest-environment jsdom
import type { Content } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import type { RteLinkPolicy } from '../../src/links';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';

const OFF = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: false,
  newsBlocks: false,
};

afterEach(() => destroyTestEditors());

function roundTrip(
  content: Content,
  linkPolicy: Partial<RteLinkPolicy> = {},
): string {
  const editor = createTestEditor({ features: OFF, linkPolicy });
  editor.commands.setContent(content);
  const html = getRteHtml(editor);
  expect(validateHtml(html, editor.storage.rtContent.schema)).toEqual([]);
  return html;
}

describe('link: leitura', () => {
  it('descarta class/title e não inventa target (lição 10)', () => {
    expect(roundTrip('<a href="https://a.com" class="x" title="t">A</a>')).toBe(
      '<p><a href="https://a.com/">A</a></p>',
    );
  });

  it('target _BLANK vira _blank com rel; rel de entrada é ignorado', () => {
    expect(
      roundTrip('<a href="https://a.com" target="_BLANK" rel="nofollow">A</a>'),
    ).toBe(
      '<p><a href="https://a.com/" target="_blank" rel="noopener noreferrer">A</a></p>',
    );
  });

  it('normaliza domínio nu', () => {
    expect(roundTrip('<a href="site.com">A</a>')).toBe(
      '<p><a href="https://site.com/">A</a></p>',
    );
  });

  it.each(['javascript:alert(1)', 'data:text/html,x'])(
    'href %s é removido, o texto fica',
    (href) => {
      expect(roundTrip(`<a href="${href}">A</a>`)).toBe('<p>A</p>');
    },
  );

  it.each(['mailto:a@b.com', 'tel:+5511999999999', '/materia', '#rt-x'])(
    'mantém %s',
    (href) => {
      expect(roundTrip(`<a href="${href}">A</a>`)).toBe(
        `<p><a href="${href}">A</a></p>`,
      );
    },
  );
});

describe('link: política', () => {
  it('forceRel em todo link', () => {
    expect(
      roundTrip('<a href="https://a.com">A</a>', { forceRel: ['nofollow'] }),
    ).toBe('<p><a href="https://a.com/" rel="nofollow">A</a></p>');
  });

  it('blockedDomains inclui subdomínios', () => {
    expect(
      roundTrip('<a href="https://sub.evil.com">A</a>', {
        blockedDomains: ['evil.com'],
      }),
    ).toBe('<p>A</p>');
  });

  it("target 'blank' só nos externos", () => {
    expect(
      roundTrip('<a href="https://a.com">A</a><a href="/interno">B</a>', {
        target: 'blank',
      }),
    ).toBe(
      '<p><a href="https://a.com/" target="_blank" rel="noopener noreferrer">A</a><a href="/interno">B</a></p>',
    );
  });

  it('protocols e allowRelative', () => {
    expect(
      roundTrip('<a href="http://a.com">A</a>', { protocols: ['https'] }),
    ).toBe('<p>A</p>');
    expect(roundTrip('<a href="/x">A</a>', { allowRelative: false })).toBe(
      '<p>A</p>',
    );
  });
});

describe('link: comandos', () => {
  it('setLink normaliza e guarda só href/target', () => {
    const editor = createTestEditor({ features: OFF }, '<p>A</p>');
    editor.commands.selectAll();
    expect(editor.commands.setLink({ href: 'site.com' })).toBe(true);
    const mark = editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0];
    expect(mark).toEqual({
      type: 'link',
      attrs: { href: 'https://site.com/', target: null },
    });
  });

  it('setLink com javascript: devolve false e não altera o documento', () => {
    const editor = createTestEditor({ features: OFF }, '<p>A</p>');
    const before = editor.getJSON();
    editor.commands.selectAll();
    expect(editor.commands.setLink({ href: 'javascript:x' })).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it('setLink com target _blank e unsetLink', () => {
    const editor = createTestEditor({ features: OFF }, '<p>A</p>');
    editor.commands.selectAll();
    expect(
      editor.commands.setLink({ href: 'https://a.com', target: '_blank' }),
    ).toBe(true);
    expect(getRteHtml(editor)).toBe(
      '<p><a href="https://a.com/" target="_blank" rel="noopener noreferrer">A</a></p>',
    );
    editor.commands.selectAll();
    expect(editor.commands.unsetLink()).toBe(true);
    expect(getRteHtml(editor)).toBe('<p>A</p>');
  });
});

describe('link: JSON, autolink e colagem', () => {
  it('marca com href javascript: vira <a> inerte', () => {
    const editor = createTestEditor({ features: OFF });
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:x' } }],
            },
          ],
        },
      ],
    });
    const html = getRteHtml(editor);
    expect(html).toBe('<p><a>x</a></p>');
    expect(
      validateHtml(html, editor.storage.rtContent.schema, {
        mode: 'accepted',
      }).map((i) => i.kind),
    ).toEqual(['missing-required-attribute']);
  });

  it('autolink de site.com ao digitar o espaço', () => {
    const editor = createTestEditor({ features: OFF }, '<p></p>');
    editor.commands.focus('end');
    for (const ch of 'site.com ') {
      const { from, to } = editor.state.selection;
      editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
    }
    expect(getRteHtml(editor)).toBe(
      '<p><a href="https://site.com/">site.com</a> </p>',
    );
  });

  it('colar HTML com javascript: não cria link', () => {
    const editor = createTestEditor({ features: OFF }, '<p></p>');
    editor.commands.focus('end');
    editor.view.pasteHTML(
      '<a href="javascript:alert(1)">A</a>',
      new Event('paste') as ClipboardEvent,
    );
    expect(getRteHtml(editor)).not.toContain('javascript');
  });
});
