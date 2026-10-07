import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHtml } from './parse';

describe('parseHtml: eventos sem par', () => {
  afterEach(() => {
    vi.doUnmock('htmlparser2');
    vi.resetModules();
  });

  it('form aninhado não passa os atributos ao elemento aberto antes dele', () => {
    expect(
      parseHtml('<form><p class="a"><form class="b" id="y">z', 256),
    ).toEqual([
      {
        tag: 'form',
        attributes: [],
        children: [{ tag: 'p', attributes: [['class', 'a']], children: ['z'] }],
      },
    ]);
  });

  it.each([
    [
      '<b><i>x</i',
      [
        {
          tag: 'b',
          attributes: [],
          children: [{ tag: 'i', attributes: [], children: ['x'] }],
        },
      ],
    ],
    ['<p>a</', [{ tag: 'p', attributes: [], children: ['a</'] }]],
    ['<b>x<i title=a', [{ tag: 'b', attributes: [], children: ['x'] }]],
  ])('entrada truncada %j', (html, expected) => {
    expect(parseHtml(html, 256)).toEqual(expected);
  });

  it('ignora o fechamento de uma tag que nunca abriu (tag inacabada no fim)', async () => {
    // O `htmlparser2` fecha no `onend` a tag cuja abertura não terminou
    // (`onopentagname` sem `onopentag`). Aqui o roteiro põe conteúdo depois
    // desse fechamento para tornar visível um `pop` errado.
    vi.doMock('htmlparser2', () => ({
      Parser: class {
        constructor(
          private readonly cbs: {
            onopentagname(name: string): void;
            onattribute(name: string, value: string): void;
            onopentag(name: string): void;
            onclosetag(name: string): void;
            ontext(text: string): void;
          },
        ) {}
        write(): void {
          const { cbs } = this;
          cbs.onopentagname('b');
          cbs.onopentag('b');
          cbs.onopentagname('i');
          cbs.onattribute('title', 'a');
          cbs.onclosetag('i');
          cbs.ontext('x');
          cbs.onclosetag('u');
          cbs.ontext('y');
          cbs.onclosetag('b');
          cbs.onclosetag('b');
          cbs.ontext('z');
        }
        end(): void {
          // O roteiro inteiro sai no `write`.
        }
      },
    }));
    vi.resetModules();
    const { parseHtml: parse } = await import('./parse');
    expect(parse('', 256)).toEqual([
      { tag: 'b', attributes: [], children: ['xy'] },
      'z',
    ]);
  });
});
