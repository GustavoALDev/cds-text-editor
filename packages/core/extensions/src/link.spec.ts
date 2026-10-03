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
    expect(html).toBe('<p>x</p>');
    expect(
      validateHtml(html, editor.storage.rtContent.schema, {
        mode: 'accepted',
      }).map((i) => i.kind),
    ).toEqual([]);
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

type TestEditor = ReturnType<typeof createTestEditor>;

function typeText(editor: TestEditor, text: string): void {
  editor.commands.focus('end');
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

const paste = () => new Event('paste') as ClipboardEvent;

describe('link: política em autolink e colagem sobre seleção', () => {
  it('colar URL bloqueada sobre seleção não cria link', () => {
    const editor = createTestEditor(
      { features: OFF, linkPolicy: { blockedDomains: ['evil.com'] } },
      '<p>texto</p>',
    );
    editor.commands.selectAll();
    editor.view.pasteText('https://evil.com', paste());
    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"');
  });

  it('autolink respeita blockedDomains e protocols', () => {
    const a = createTestEditor(
      { features: OFF, linkPolicy: { blockedDomains: ['evil.com'] } },
      '<p></p>',
    );
    typeText(a, 'evil.com ');
    expect(JSON.stringify(a.getJSON())).not.toContain('"link"');
    const b = createTestEditor(
      { features: OFF, linkPolicy: { protocols: ['https'] } },
      '<p></p>',
    );
    typeText(b, 'http://a.com ');
    expect(JSON.stringify(b.getJSON())).not.toContain('"link"');
  });
});

describe('link: toggleLink', () => {
  const attrsOf = (e: TestEditor) =>
    e.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs;

  it('normaliza href', () => {
    const e = createTestEditor({ features: OFF }, '<p>A</p>');
    e.commands.selectAll();
    expect(e.commands.toggleLink({ href: 'site.com' })).toBe(true);
    expect(attrsOf(e)).toEqual({ href: 'https://site.com/', target: null });
  });

  it('target fora do contrato vira null', () => {
    const e = createTestEditor({ features: OFF }, '<p>A</p>');
    e.commands.selectAll();
    expect(
      e.commands.toggleLink({ href: 'https://a.com', target: '_SELF' }),
    ).toBe(true);
    expect(attrsOf(e)).toEqual({ href: 'https://a.com/', target: null });
  });

  it('sem href ou href inválido devolve false', () => {
    const e = createTestEditor({ features: OFF }, '<p>A</p>');
    const before = e.getJSON();
    e.commands.selectAll();
    const toggle = e.commands.toggleLink as (a?: unknown) => boolean;
    expect(toggle()).toBe(false);
    expect(toggle({})).toBe(false);
    expect(toggle({ href: 'javascript:x' })).toBe(false);
    expect(e.getJSON()).toEqual(before);
  });
});

describe('link: href canônico guardado', () => {
  it('autolink guarda https://site.com/', () => {
    const e = createTestEditor({ features: OFF }, '<p></p>');
    typeText(e, 'site.com ');
    expect(JSON.stringify(e.getJSON())).toContain('"href":"https://site.com/"');
  });

  it('colar <a> guarda href canônico', () => {
    const e = createTestEditor({ features: OFF }, '<p></p>');
    e.commands.focus('end');
    e.view.pasteHTML('<a href="https://site.com">A</a>', paste());
    expect(JSON.stringify(e.getJSON())).toContain('"href":"https://site.com/"');
  });

  it('edição alheia não mexe em outro link não canônico', () => {
    const e = createTestEditor({ features: OFF }, '<p>a</p><p>L</p>');
    const linkType = e.schema.marks['link']!;
    const second = e.state.doc.child(0).nodeSize;
    const legacy = linkType.create({
      href: 'https://legacy.com',
      target: null,
    });
    // applyInner não roda o appendTransaction: o estado fica com marca legada.
    e.view.updateState(
      (
        e.state as unknown as { applyInner(tr: unknown): typeof e.state }
      ).applyInner(e.state.tr.addMark(second + 1, second + 2, legacy)),
    );
    const before = e.state.doc.child(1);
    e.view.dispatch(e.state.tr.insertText('b', 2));
    expect(e.state.doc.child(1)).toBe(before);
    expect(e.state.doc.child(1).child(0).marks[0]?.attrs['href']).toBe(
      'https://legacy.com',
    );
    // Tocando o trecho, vira canônico.
    e.view.dispatch(e.state.tr.insertText('c', second + 2));
    expect(e.state.doc.child(1).child(0).marks[0]?.attrs['href']).toBe(
      'https://legacy.com/',
    );
  });
});
