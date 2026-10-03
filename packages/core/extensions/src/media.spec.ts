// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { DOMParser as PMParser } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import type { RteEditorOptions } from './types';

const ONLY_MEDIA = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: true,
  embeds: false,
  newsBlocks: false,
};

const IMG = 'loading="lazy" decoding="async"';
const FIG = '<figure class="rt-figure rt-figure--center">';

afterEach(() => destroyTestEditors());

function editorWith(
  content: string | object = '',
  options: RteEditorOptions = {},
): Editor {
  return createTestEditor(
    { ...options, features: { ...ONLY_MEDIA, ...options.features } },
    content as string,
  );
}

function canonical(editor: Editor): string {
  const out = getRteHtml(editor);
  expect(
    validateHtml(out, editor.storage.rtContent.schema, { mode: 'canonical' }),
  ).toEqual([]);
  return out;
}

function html(content: string | object, options?: RteEditorOptions): string {
  return canonical(editorWith(content, options));
}

/** Cursor no deslocamento `offset` do primeiro bloco de texto igual a `text`. */
function cursorIn(editor: Editor, text: string, offset = 0): void {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos + 1 + offset;
    }
    return target < 0;
  });
  if (target < 0) throw new Error(`bloco "${text}" não encontrado`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, target),
    ),
  );
}

/** Seleciona (NodeSelection) o primeiro nó do tipo `name`. */
function selectNode(editor: Editor, name: string): void {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.type.name === name) target = pos;
    return target < 0;
  });
  if (target < 0) throw new Error(`nó "${name}" não encontrado`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, target),
    ),
  );
}

function imageAttrs(editor: Editor): Record<string, unknown> {
  let attrs: Record<string, unknown> | null = null;
  editor.state.doc.descendants((node) => {
    if (attrs === null && node.type.name === 'rtImage') attrs = node.attrs;
    return attrs === null;
  });
  if (attrs === null) throw new Error('sem rtImage');
  return attrs;
}

const FULL_IMAGE = {
  src: 'https://cdn.site.com/a.jpg',
  alt: 'Gato',
  width: 400,
  height: 200,
  caption: 'Legenda',
  credit: 'Foto: Ana',
};

describe('rtImage: saída', () => {
  it('setImage com legenda e crédito produz a figura da 03a §4.7', () => {
    const editor = editorWith();
    expect(editor.commands.setImage(FULL_IMAGE)).toBe(true);
    expect(canonical(editor)).toBe(
      `${FIG}<img src="https://cdn.site.com/a.jpg" alt="Gato" width="400" height="200" ${IMG}><figcaption>Legenda <small class="rt-credit">Foto: Ana</small></figcaption></figure>`,
    );
  });

  it('só legenda, só crédito e nenhum dos dois', () => {
    const only = (extra: object) => {
      const editor = editorWith();
      editor.commands.setImage({ src: '/a.jpg', alt: 'x', ...extra });
      return canonical(editor);
    };
    const img = `<img src="/a.jpg" alt="x" ${IMG}>`;
    expect(only({ caption: 'Legenda' })).toBe(
      `${FIG}${img}<figcaption>Legenda</figcaption></figure>`,
    );
    expect(only({ credit: 'Foto: Ana' })).toBe(
      `${FIG}${img}<figcaption><small class="rt-credit">Foto: Ana</small></figcaption></figure>`,
    );
    expect(only({})).toBe(`${FIG}${img}</figure>`);
  });

  it('alt null sai como alt="" e o JSON mantém alt: null', () => {
    const editor = editorWith();
    editor.commands.setImage({ src: '/a.jpg', alt: null });
    expect(canonical(editor)).toBe(
      `${FIG}<img src="/a.jpg" alt="" ${IMG}></figure>`,
    );
    expect(imageAttrs(editor)['alt']).toBeNull();
    expect(editor.getJSON().content?.[0]?.attrs?.['alt']).toBeNull();
  });

  it('srcset e sizes saem depois de decoding', () => {
    const editor = editorWith();
    editor.commands.setImage({
      src: '/a.jpg',
      alt: '',
      srcset: '/a.jpg 1x,   /a@2x.jpg 2x',
      sizes: '(max-width: 600px) 100vw, 600px',
    });
    expect(canonical(editor)).toBe(
      `${FIG}<img src="/a.jpg" alt="" ${IMG} srcset="/a.jpg 1x, /a@2x.jpg 2x" sizes="(max-width: 600px) 100vw, 600px"></figure>`,
    );
  });

  it('os 4 alinhamentos são ponto fixo', () => {
    for (const align of ['left', 'center', 'right', 'full']) {
      const out = `<figure class="rt-figure rt-figure--${align}"><img src="/a.jpg" alt="x" ${IMG}></figure>`;
      expect(html(out)).toBe(out);
    }
  });

  it('JSON com src javascript: sai inerte (só falta o src obrigatório)', () => {
    const editor = editorWith({
      type: 'doc',
      content: [{ type: 'rtImage', attrs: { src: 'javascript:x' } }],
    });
    const out = getRteHtml(editor);
    expect(out).toBe(`${FIG}<img alt="" ${IMG}></figure>`);
    const schema = editor.storage.rtContent.schema;
    expect(validateHtml(out, schema, { mode: 'accepted' })).toEqual([
      expect.objectContaining({
        kind: 'missing-required-attribute',
        name: 'src',
      }),
    ]);
  });

  it('JSON com atributos inválidos é revalidado na renderização', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'rtImage',
          attrs: {
            src: '/a.jpg',
            alt: 'a'.repeat(999) + '😀',
            width: 0,
            height: 10001,
            srcset: 'javascript:x 1x',
            sizes: '<b>',
            align: 'middle',
            caption: '  Leg \n enda ',
            credit: 5,
          },
        },
      ],
    });
    expect(canonical(editor)).toBe(
      `${FIG}<img src="/a.jpg" alt="${'a'.repeat(999)}" ${IMG}><figcaption>Leg enda</figcaption></figure>`,
    );
  });
});

describe('rtImage: leitura', () => {
  const plain = `${FIG}<img src="/a.jpg" alt="" ${IMG}></figure>`;

  it('<p><img></p> e <p> <img> </p> viram só a figura (lição 18)', () => {
    expect(html('<p><img src="/a.jpg"></p>')).toBe(plain);
    expect(html('<p> <img src="/a.jpg"> </p>')).toBe(plain);
    expect(html('<p>\n  <!-- x --><img src="/a.jpg">\n</p>')).toBe(plain);
  });

  it('img no meio do texto divide o parágrafo', () => {
    expect(html('<p>a<img src="/a.jpg">b</p>')).toBe(
      `<p>a</p>${plain}<p>b</p>`,
    );
  });

  it('img solto e figure genérica com img', () => {
    expect(html('<img src="/a.jpg">')).toBe(plain);
    expect(html('<figure><img src="/a.jpg"></figure>')).toBe(plain);
  });

  it('legenda sem o crédito, espaços colapsados; crédito do primeiro small', () => {
    const editor = editorWith(
      '<figure><img src="/a.jpg" alt="x"><figcaption>  Leg   enda <small class="rt-credit">Foto</small><small class="rt-credit">Outro</small></figcaption></figure>',
    );
    expect(imageAttrs(editor)['caption']).toBe('Leg enda');
    expect(imageAttrs(editor)['credit']).toBe('Foto');
    expect(canonical(editor)).toBe(
      `${FIG}<img src="/a.jpg" alt="x" ${IMG}><figcaption>Leg enda <small class="rt-credit">Foto</small></figcaption></figure>`,
    );
  });

  it('align pela classe; sem classe → center', () => {
    const left = editorWith(
      '<figure class="rt-figure rt-figure--left"><img src="/a.jpg"></figure>',
    );
    expect(imageAttrs(left)['align']).toBe('left');
    const none = editorWith('<figure><img src="/a.jpg"></figure>');
    expect(imageAttrs(none)['align']).toBe('center');
  });

  it('src javascript:/data: não vira imagem; a legenda fica como parágrafo', () => {
    expect(html('<img src="javascript:x">')).toBe('<p></p>');
    expect(
      html('<figure><img src="data:x"><figcaption>Leg</figcaption></figure>'),
    ).toBe('<p>Leg</p>');
  });

  it('alt acima de 1000 é cortado no limite, sem partir par substituto', () => {
    const long = editorWith(`<img src="/a.jpg" alt="${'b'.repeat(1001)}">`);
    expect(imageAttrs(long)['alt']).toBe('b'.repeat(1000));
    canonical(long);
    const emoji = editorWith(`<img src="/a.jpg" alt="${'b'.repeat(999)}😀">`);
    expect(imageAttrs(emoji)['alt']).toBe('b'.repeat(999));
  });

  it('mediaHosts e allowRelativeMedia valem na leitura', () => {
    expect(
      html('<img src="https://outro.com/a.jpg">', {
        mediaHosts: ['cdn.site.com'],
      }),
    ).toBe('<p></p>');
    expect(
      html('<img src="https://cdn.site.com/a.jpg">', {
        mediaHosts: ['cdn.site.com'],
      }),
    ).toBe(
      `${FIG}<img src="https://cdn.site.com/a.jpg" alt="" ${IMG}></figure>`,
    );
    expect(html('<img src="/a.jpg">', { allowRelativeMedia: false })).toBe(
      '<p></p>',
    );
  });

  it('srcset com candidato inválido e sizes inválido são omitidos', () => {
    expect(
      html(
        '<img src="/a.jpg" alt="" srcset="/a.jpg 1x, javascript:x 2x" sizes="<b>" width="0" height="20">',
      ),
    ).toBe(`${FIG}<img src="/a.jpg" alt="" height="20" ${IMG}></figure>`);
  });

  it('as regras de leitura não alteram o DOM de entrada', () => {
    const editor = editorWith();
    const element = document.createElement('div');
    element.append(document.createElement('p'));
    const p = element.firstElementChild as HTMLElement;
    p.append(' ');
    const img = document.createElement('img');
    img.setAttribute('src', '/a.jpg');
    img.setAttribute('alt', 'b'.repeat(1001));
    p.append(img, ' ');
    const figure = document.createElement('figure');
    figure.setAttribute('class', 'rt-figure rt-figure--video');
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('src', '/v.mp4');
    const track = document.createElement('track');
    track.setAttribute('src', '/pt.vtt');
    track.setAttribute('srclang', 'pt');
    track.setAttribute('label', 'c'.repeat(101));
    video.append(source, track);
    const caption = document.createElement('figcaption');
    caption.append('  Vídeo  ');
    figure.append(video, caption);
    element.append(figure);
    const before = element.outerHTML;
    const parser = PMParser.fromSchema(editor.schema);
    const first = parser.parse(element).toJSON();
    expect(element.outerHTML).toBe(before);
    expect(parser.parse(element).toJSON()).toEqual(first);
    expect(element.outerHTML).toBe(before);
  });
});

describe('rtVideo', () => {
  const VIDEO = {
    src: 'https://cdn.site.com/v.mp4',
    width: 640,
    height: 360,
    poster: 'https://cdn.site.com/p.jpg',
    tracks: [
      {
        kind: 'captions' as const,
        src: '/pt.vtt',
        srclang: 'pt-BR',
        label: 'Português',
        default: true,
      },
      {
        kind: 'subtitles' as const,
        src: '/en.vtt',
        srclang: 'en',
        label: 'English',
        default: true,
      },
    ],
  };
  const OUT =
    '<figure class="rt-figure rt-figure--video"><video src="https://cdn.site.com/v.mp4" controls="" preload="metadata" playsinline="" width="640" height="360" poster="https://cdn.site.com/p.jpg"><track kind="captions" src="/pt.vtt" srclang="pt-BR" label="Português" default=""><track kind="subtitles" src="/en.vtt" srclang="en" label="English"></video></figure>';

  it('setVideo produz a figura da 03a §4.7 com no máximo um default', () => {
    const editor = editorWith();
    expect(editor.commands.setVideo(VIDEO)).toBe(true);
    expect(canonical(editor)).toBe(OUT);
  });

  it('a saída é ponto fixo da leitura', () => {
    expect(html(OUT)).toBe(OUT);
    const withCaption = OUT.replace(
      '</video></figure>',
      '</video><figcaption>Clipe</figcaption></figure>',
    );
    expect(html(withCaption)).toBe(withCaption);
  });

  it('track inválido é descartado e label é cortado em 100', () => {
    const editor = editorWith();
    editor.commands.setVideo({
      src: '/v.mp4',
      preload: 'none',
      tracks: [
        { kind: 'captions', src: 'javascript:x', srclang: 'pt', label: 'A' },
        {
          kind: 'chapters' as 'captions',
          src: '/c.vtt',
          srclang: 'pt',
          label: 'B',
        },
        {
          kind: 'captions',
          src: '/ok.vtt',
          srclang: 'pt',
          label: 'd'.repeat(101),
        },
      ],
    });
    expect(canonical(editor)).toBe(
      `<figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="none" playsinline=""><track kind="captions" src="/ok.vtt" srclang="pt" label="${'d'.repeat(100)}"></video></figure>`,
    );
  });

  it('video > source: o primeiro src válido', () => {
    expect(
      html(
        '<video><source src="javascript:x"><source src="/v.mp4"><source src="/w.mp4"></video>',
      ),
    ).toBe(
      '<figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="metadata" playsinline=""></video></figure>',
    );
  });

  it('video sem src válido não vira nó; a legenda fica como parágrafo', () => {
    expect(
      html(
        '<figure><video src="javascript:x"></video><figcaption>Leg</figcaption></figure>',
      ),
    ).toBe('<p>Leg</p>');
  });

  it('leitura descarta track inválido, mantém só o primeiro default e corta label', () => {
    expect(
      html(
        `<video src="/v.mp4" autoplay loop><track kind="chapters" src="/c.vtt" srclang="pt" label="C"><track src="javascript:x" srclang="pt" label="X" default><track kind="captions" src="/a.vtt" srclang="pt" label="${'e'.repeat(101)}" default><track kind="subtitles" src="/b.vtt" srclang="en" label="B" default></video>`,
      ),
    ).toBe(
      `<figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="metadata" playsinline=""><track kind="captions" src="/a.vtt" srclang="pt" label="${'e'.repeat(100)}" default=""><track kind="subtitles" src="/b.vtt" srclang="en" label="B"></video></figure>`,
    );
  });

  it('setVideo com src inválido devolve false; updateVideo muda a legenda', () => {
    const editor = editorWith();
    expect(editor.commands.setVideo({ src: 'javascript:x' })).toBe(false);
    expect(
      editor.commands.setVideo({ src: '/v.mp4', preload: 'auto' as 'none' }),
    ).toBe(false);
    expect(editor.commands.setVideo({ src: '/v.mp4' })).toBe(true);
    expect(editor.commands.updateVideo({ caption: '  Novo  vídeo ' })).toBe(
      true,
    );
    expect(canonical(editor)).toBe(
      '<figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="metadata" playsinline=""></video><figcaption>Novo vídeo</figcaption></figure>',
    );
    expect(editor.commands.updateVideo({ poster: 'javascript:x' })).toBe(false);
  });
});

describe('rtImage: comandos', () => {
  it('em parágrafo vazio, setImage substitui o parágrafo (lição 14)', () => {
    const editor = editorWith('<p>a</p><p></p>');
    cursorIn(editor, '');
    expect(editor.commands.setImage({ src: '/a.jpg', alt: 'x' })).toBe(true);
    expect(canonical(editor)).toBe(
      `<p>a</p>${FIG}<img src="/a.jpg" alt="x" ${IMG}></figure>`,
    );
    // O nó novo fica selecionado (localizado pelo src).
    const selection = editor.state.selection;
    expect(selection).toBeInstanceOf(NodeSelection);
    expect((selection as NodeSelection).node.attrs['src']).toBe('/a.jpg');
  });

  it('em parágrafo com texto, insere depois do bloco', () => {
    const editor = editorWith('<p>a</p><p>b</p>');
    cursorIn(editor, 'a', 1);
    expect(editor.commands.setImage({ src: '/a.jpg', alt: 'x' })).toBe(true);
    expect(canonical(editor)).toBe(
      `<p>a</p>${FIG}<img src="/a.jpg" alt="x" ${IMG}></figure><p>b</p>`,
    );
  });

  it('com a mesma imagem já no documento, seleciona a recém-inserida', () => {
    const editor = editorWith(
      `${FIG}<img src="/a.jpg" alt="x" ${IMG}></figure><p>a</p><p></p>`,
    );
    cursorIn(editor, '');
    editor.commands.setImage({ src: '/a.jpg', alt: 'y' });
    const selection = editor.state.selection as NodeSelection;
    expect(selection.node.attrs['alt']).toBe('y');
  });

  it('item de tarefa vazio: insere depois da lista (o item não aceita bloco)', () => {
    const list =
      '<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" disabled=""></label></li></ul>';
    const editor = editorWith(list, { features: { tasks: true } });
    cursorIn(editor, '');
    expect(editor.commands.setImage({ src: '/a.jpg', alt: 'x' })).toBe(true);
    expect(canonical(editor)).toBe(
      `${list}${FIG}<img src="/a.jpg" alt="x" ${IMG}></figure>`,
    );
  });

  it('entrada inválida devolve false e não muda o documento', () => {
    const editor = editorWith('<p></p>');
    const before = editor.state.doc;
    expect(editor.commands.setImage({ src: 'javascript:x' })).toBe(false);
    expect(editor.commands.setImage({ src: '/a.jpg', width: 0 })).toBe(false);
    expect(
      editor.commands.setImage({ src: '/a.jpg', srcset: 'javascript:x 1x' }),
    ).toBe(false);
    expect(
      editor.commands.setImage({ src: '/a.jpg', align: 'middle' as 'left' }),
    ).toBe(false);
    expect(editor.state.doc).toBe(before);
  });

  it('setImageSize mantém a proporção e recusa largura fora de 1–10000', () => {
    const editor = editorWith();
    editor.commands.setImage({
      src: '/a.jpg',
      alt: '',
      width: 400,
      height: 200,
    });
    expect(editor.commands.setImageSize({ width: 200 })).toBe(true);
    expect(imageAttrs(editor)).toMatchObject({ width: 200, height: 100 });
    expect(editor.commands.setImageSize({ width: 0 })).toBe(false);
    expect(editor.commands.setImageSize({ width: 10001 })).toBe(false);
    expect(editor.commands.setImageSize({ width: 1.5 })).toBe(false);
    expect(canonical(editor)).toContain('width="200" height="100"');
  });

  it('setImageAlign e updateImage', () => {
    const editor = editorWith();
    editor.commands.setImage(FULL_IMAGE);
    expect(editor.commands.setImageAlign('full')).toBe(true);
    expect(editor.commands.setImageAlign('middle' as 'full')).toBe(false);
    expect(editor.commands.updateImage({ caption: 'Nova' })).toBe(true);
    expect(canonical(editor)).toBe(
      `<figure class="rt-figure rt-figure--full"><img src="https://cdn.site.com/a.jpg" alt="Gato" width="400" height="200" ${IMG}><figcaption>Nova <small class="rt-credit">Foto: Ana</small></figcaption></figure>`,
    );
    expect(editor.commands.updateImage({ src: 'data:x' })).toBe(false);
  });

  it('comandos de atualização sem imagem selecionada devolvem false', () => {
    const editor = editorWith(
      `<p>a</p>${FIG}<img src="/a.jpg" alt="x"></figure>`,
    );
    cursorIn(editor, 'a');
    expect(editor.commands.updateImage({ caption: 'x' })).toBe(false);
    expect(editor.commands.setImageSize({ width: 10 })).toBe(false);
    expect(editor.commands.setImageAlign('left')).toBe(false);
    selectNode(editor, 'rtImage');
    expect(editor.commands.setImageAlign('left')).toBe(true);
  });

  it('valores gravados pelos comandos são canônicos', () => {
    const editor = editorWith();
    editor.commands.setImage({
      src: '/a.jpg',
      alt: 'z'.repeat(999) + '😀',
      caption: ' a \n b ',
      credit: '  c ',
    });
    expect(imageAttrs(editor)).toMatchObject({
      alt: 'z'.repeat(999),
      caption: 'a b',
      credit: 'c',
      align: 'center',
    });
  });
});

describe('figure: só mídia filha direta (A1: o texto fica)', () => {
  const fig = (src: string, extra = '') =>
    `${FIG}<img src="${src}" alt="" ${IMG}>${extra}</figure>`;

  it('figure com outro conteúdo mantém o texto e a imagem', () => {
    expect(html('<figure><p>Texto longo</p><img src="/a.jpg"></figure>')).toBe(
      `<p>Texto longo</p>${fig('/a.jpg')}`,
    );
  });

  it('duas imagens na figure: as duas ficam', () => {
    expect(html('<figure><img src="/a.jpg"><img src="/b.jpg"></figure>')).toBe(
      `${fig('/a.jpg')}${fig('/b.jpg')}`,
    );
  });

  it('img dentro de tabela na figure não vira a imagem da figure', () => {
    const out = html(
      '<figure><table><tbody><tr><td>Célula</td></tr></tbody></table><img src="/a.jpg"></figure>',
    );
    expect(out).toContain('Célula');
    expect(out).toContain(fig('/a.jpg'));
  });

  it('img dentro do figcaption não é a imagem da figure', () => {
    expect(
      html('<figure><figcaption><img src="/b.jpg">Leg</figcaption></figure>'),
    ).toBe(`${fig('/b.jpg')}<p>Leg</p>`);
    expect(
      html(
        '<figure><img src="/a.jpg"><figcaption>Leg<img src="/b.jpg"></figcaption></figure>',
      ),
    ).toBe(`${fig('/a.jpg')}<p>Leg</p>${fig('/b.jpg')}`);
  });

  it('citação em destaque com img (newsBlocks desligado) mantém o texto', () => {
    const out = html(
      '<figure class="rt-pullquote"><blockquote><p>Citação forte<img src="/a.jpg"></p></blockquote><figcaption><cite>Ana</cite>, editora</figcaption></figure>',
    );
    expect(out).toBe(
      `<blockquote><p>Citação forte</p>${fig('/a.jpg')}</blockquote><p>Ana, editora</p>`,
    );
  });

  it('img dentro de um único a ou picture filho direto é aceito', () => {
    expect(
      html(
        '<figure class="rt-figure rt-figure--right"><a href="https://site.com/"><img src="/a.jpg"></a><figcaption>L</figcaption></figure>',
      ),
    ).toBe(
      `<figure class="rt-figure rt-figure--right"><img src="/a.jpg" alt="" ${IMG}><figcaption>L</figcaption></figure>`,
    );
    expect(
      html(
        '<figure><picture><source srcset="/a.webp"> <img src="/a.jpg"></picture></figure>',
      ),
    ).toBe(fig('/a.jpg'));
  });

  it('video fora de filho direto não vira a mídia da figure', () => {
    const out = html(
      '<figure><p>Antes</p><video src="/v.mp4"></video><figcaption>Leg</figcaption></figure>',
    );
    expect(out).toBe(
      '<p>Antes</p><figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="metadata" playsinline=""></video></figure><p>Leg</p>',
    );
  });
});

describe('figcaption: texto da legenda', () => {
  it('br vira espaço; script, style e template são ignorados', () => {
    expect(
      html(
        '<figure><img src="/a.jpg"><figcaption>Linha<br>dois<script>x()</script><style>p{}</style><template>t</template> <small class="rt-credit">Foto<br>Ana</small></figcaption></figure>',
      ),
    ).toBe(
      `${FIG}<img src="/a.jpg" alt="" ${IMG}><figcaption>Linha dois <small class="rt-credit">Foto Ana</small></figcaption></figure>`,
    );
    expect(
      html(
        '<figure><video src="/v.mp4"></video><figcaption>Um<br>dois</figcaption></figure>',
      ),
    ).toBe(
      '<figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="metadata" playsinline=""></video><figcaption>Um dois</figcaption></figure>',
    );
  });
});

describe('URLs revalidadas na renderização e mediaHosts', () => {
  it('JSON de vídeo: poster javascript: e track com src data: são descartados', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'rtVideo',
          attrs: {
            src: '/v.mp4',
            poster: 'javascript:x',
            tracks: [
              {
                kind: 'captions',
                src: 'data:text/vtt,x',
                srclang: 'pt',
                label: 'X',
              },
              { kind: 'captions', src: '/ok.vtt', srclang: 'pt', label: 'OK' },
            ],
          },
        },
      ],
    });
    expect(canonical(editor)).toBe(
      '<figure class="rt-figure rt-figure--video"><video src="/v.mp4" controls="" preload="metadata" playsinline=""><track kind="captions" src="/ok.vtt" srclang="pt" label="OK"></video></figure>',
    );
  });

  it('mediaHosts: src de outro host sai inerte do JSON e é recusado por setImage', () => {
    const options = { mediaHosts: ['cdn.site.com'] };
    const json = editorWith(
      {
        type: 'doc',
        content: [
          { type: 'rtImage', attrs: { src: 'https://outro.com/a.jpg' } },
        ],
      },
      options,
    );
    const out = getRteHtml(json);
    expect(out).toBe(`${FIG}<img alt="" ${IMG}></figure>`);
    expect(
      validateHtml(out, json.storage.rtContent.schema, { mode: 'accepted' }),
    ).toEqual([
      expect.objectContaining({
        kind: 'missing-required-attribute',
        name: 'src',
      }),
    ]);
    const editor = editorWith('<p></p>', options);
    expect(editor.commands.setImage({ src: 'https://outro.com/a.jpg' })).toBe(
      false,
    );
    expect(
      editor.commands.setImage({ src: 'https://cdn.site.com/a.jpg' }),
    ).toBe(true);
  });
});
