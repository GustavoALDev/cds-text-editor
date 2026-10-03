// @vitest-environment jsdom
import type { Editor } from '@tiptap/core';
import { DOMParser as PMParser } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { validateHtml } from '../../html/src/validate-html';
import type { RteEmbedProvider } from '../../src/schema/types';
import { createEditorExtensions } from './factory';
import { getRteHtml } from './serialize';
import { createTestEditor, destroyTestEditors } from './testing/editor';
import type { RteEditorOptions } from './types';

const ONLY_EMBEDS = {
  colors: false,
  code: false,
  tables: false,
  tasks: false,
  media: false,
  embeds: true,
  newsBlocks: false,
};

const ID = 'dQw4w9WgXcQ';
const NOCOOKIE = `https://www.youtube-nocookie.com/embed/${ID}`;
const FIXED =
  'loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"';
const YT_FIG =
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube">';
const SPOTIFY_TRACK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';

afterEach(() => destroyTestEditors());

function editorWith(
  content: string | object = '',
  options: RteEditorOptions = {},
): Editor {
  return createTestEditor(
    { ...options, features: { ...ONLY_EMBEDS, ...options.features } },
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

function ytIframe(size = 'width="640" height="360"', style = true): string {
  const css = style ? ' style="aspect-ratio: 16 / 9"' : '';
  return `<iframe src="${NOCOOKIE}" title="YouTube" ${size}${css} ${FIXED}></iframe>`;
}

function embedCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'rtEmbed') count += 1;
  });
  return count;
}

function selectEmbed(editor: Editor): void {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.type.name === 'rtEmbed') target = pos;
    return target < 0;
  });
  if (target < 0) throw new Error('rtEmbed não encontrado');
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, target),
    ),
  );
}

/** Provedor do consumidor (host com ponto, padrão ancorado no host). */
const EXAMPLE: RteEmbedProvider = {
  id: 'example',
  name: 'Example',
  hosts: ['embed.example.com'],
  srcPatterns: ['^https://embed\\.example\\.com/v/\\d{1,6}$'],
  match: (url) => /^https:\/\/example\.com\/watch\/\d{1,6}$/.test(url),
  toEmbed: (url) => {
    const id = /(\d{1,6})$/.exec(url)?.[1];
    return id ? { src: `https://embed.example.com/v/${id}` } : null;
  },
};

describe('rtEmbed: comandos', () => {
  it('setEmbed do YouTube com legenda produz a marcação da 03a §4.8', () => {
    const editor = editorWith();
    expect(
      editor.commands.setEmbed(`https://youtu.be/${ID}`, { caption: 'Clipe' }),
    ).toBe(true);
    expect(canonical(editor)).toBe(
      `${YT_FIG}<iframe src="${NOCOOKIE}" title="YouTube" width="640" height="360" style="aspect-ratio: 16 / 9" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe><figcaption>Clipe</figcaption></figure>`,
    );
  });

  it('Spotify (faixa) sai com height="152" e sem style', () => {
    const editor = editorWith();
    expect(editor.commands.setEmbed(SPOTIFY_TRACK)).toBe(true);
    expect(canonical(editor)).toBe(
      '<figure class="rt-embed rt-embed--spotify" data-rt-provider="spotify"><iframe src="https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC" title="Spotify" width="640" height="152" ' +
        `${FIXED}></iframe></figure>`,
    );
  });

  it('Shorts sai com aspect-ratio 9 / 16', () => {
    const editor = editorWith();
    editor.commands.setEmbed(`https://www.youtube.com/shorts/${ID}`);
    expect(canonical(editor)).toBe(
      `${YT_FIG}<iframe src="${NOCOOKIE}" title="YouTube" width="640" height="1138" style="aspect-ratio: 9 / 16" ${FIXED}></iframe></figure>`,
    );
  });

  it('Vimeo com legenda', () => {
    const editor = editorWith();
    editor.commands.setEmbed('https://vimeo.com/76979871', { caption: 'V' });
    expect(canonical(editor)).toBe(
      `<figure class="rt-embed rt-embed--vimeo" data-rt-provider="vimeo"><iframe src="https://player.vimeo.com/video/76979871" title="Vimeo" width="640" height="360" style="aspect-ratio: 16 / 9" ${FIXED}></iframe><figcaption>V</figcaption></figure>`,
    );
  });

  it('URL fora dos provedores, javascript: e entrada inválida → false', () => {
    const editor = editorWith('<p>a</p>');
    expect(editor.commands.setEmbed('https://evil.com/x')).toBe(false);
    expect(editor.commands.setEmbed('javascript:alert(1)')).toBe(false);
    expect(editor.commands.setEmbed(NOCOOKIE.replace(ID, 'curto'))).toBe(false);
    expect(
      editor.commands.setEmbed(42 as unknown as string, { caption: 'x' }),
    ).toBe(false);
    expect(
      editor.commands.setEmbed(`https://youtu.be/${ID}`, {
        caption: 1 as unknown as string,
      }),
    ).toBe(false);
    expect(embedCount(editor)).toBe(0);
  });

  it('em parágrafo vazio substitui o parágrafo (lição 14) e fica selecionado', () => {
    const editor = editorWith('<p></p>');
    editor.commands.setEmbed(`https://youtu.be/${ID}`);
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.firstChild?.type.name).toBe('rtEmbed');
    const selection = editor.state.selection;
    expect(selection instanceof NodeSelection).toBe(true);
    expect((selection as NodeSelection).node.type.name).toBe('rtEmbed');
  });

  it('updateEmbed troca a legenda do embed selecionado', () => {
    const editor = editorWith();
    editor.commands.setEmbed(`https://youtu.be/${ID}`, { caption: 'A' });
    selectEmbed(editor);
    expect(editor.commands.updateEmbed({ caption: '  Nova   legenda ' })).toBe(
      true,
    );
    expect(canonical(editor)).toBe(
      `${YT_FIG}${ytIframe()}<figcaption>Nova legenda</figcaption></figure>`,
    );
    expect(editor.commands.updateEmbed({ caption: '' })).toBe(true);
    expect(canonical(editor)).toBe(`${YT_FIG}${ytIframe()}</figure>`);
    expect(
      editor.commands.updateEmbed({ caption: 3 as unknown as string }),
    ).toBe(false);
  });

  it('updateEmbed sem embed selecionado → false', () => {
    const editor = editorWith('<p>a</p>');
    expect(editor.commands.updateEmbed({ caption: 'x' })).toBe(false);
  });
});

describe('rtEmbed: leitura', () => {
  it('iframe solto do youtube.com/embed vira embed nocookie', () => {
    expect(
      html(`<iframe src="https://www.youtube.com/embed/${ID}"></iframe>`),
    ).toBe(`${YT_FIG}${ytIframe()}</figure>`);
  });

  it('figure.rt-embed: title cortado em 300 sem substituto solto; width/height mantidos', () => {
    const title = 'a'.repeat(299) + '😀';
    expect(title.length).toBe(301);
    const editor = editorWith(
      `<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="${NOCOOKIE}" title="${title}" width="560" height="315"></iframe><figcaption>  Leg  enda </figcaption></figure>`,
    );
    const out = canonical(editor);
    expect(out).toBe(
      `${YT_FIG}<iframe src="${NOCOOKIE}" title="${'a'.repeat(299)}" width="560" height="315" ${FIXED}></iframe><figcaption>Leg enda</figcaption></figure>`,
    );
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('sem width/height → 640 × 360; style aspect-ratio lido', () => {
    expect(html(`<figure><iframe src="${NOCOOKIE}"></iframe></figure>`)).toBe(
      `${YT_FIG}${ytIframe(undefined, false)}</figure>`,
    );
    expect(
      html(
        `<iframe src="${NOCOOKIE}" style="aspect-ratio: 9 / 16; border: 0"></iframe>`,
      ),
    ).toBe(
      `${YT_FIG}<iframe src="${NOCOOKIE}" title="YouTube" width="640" height="1138" style="aspect-ratio: 9 / 16" ${FIXED}></iframe></figure>`,
    );
  });

  it('valores fixos e atributos estranhos da entrada não passam', () => {
    expect(
      html(
        `<iframe src="${NOCOOKIE}" title="T" width="0" height="x" sandbox="allow-top-navigation allow-scripts" allow="camera" referrerpolicy="unsafe-url" loading="eager" onload="x()" srcdoc="&lt;b&gt;"></iframe>`,
      ),
    ).toBe(
      `${YT_FIG}<iframe src="${NOCOOKIE}" title="T" width="640" height="360" ${FIXED}></iframe></figure>`,
    );
  });

  it('iframe de host desconhecido, javascript: ou só srcdoc → nada', () => {
    for (const input of [
      '<iframe src="https://evil.com/x"></iframe>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<iframe srcdoc="<script>x</script>"></iframe>',
      '<iframe src="https://www.youtube-nocookie.com/embed/curto"></iframe>',
      `<iframe src="https://www.youtube-nocookie.com/embed/${ID}?autoplay=1"></iframe>`,
      `<iframe src="http://www.youtube-nocookie.com/embed/${ID}"></iframe>`,
      '<figure class="rt-embed"><iframe src="https://evil.com/x"></iframe></figure>',
    ]) {
      const editor = editorWith(input);
      expect(embedCount(editor), input).toBe(0);
      expect(canonical(editor), input).not.toContain('iframe');
    }
  });

  it('srcdoc com src válido → embed sem srcdoc', () => {
    const out = html(
      `<iframe srcdoc="<script>x</script>" src="${NOCOOKIE}"></iframe>`,
    );
    expect(out).toBe(`${YT_FIG}${ytIframe(undefined, false)}</figure>`);
    expect(out).not.toContain('srcdoc');
  });

  it('src de um provedor com o padrão de outro: provedor = o do padrão que casa', () => {
    expect(
      html(
        '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://player.vimeo.com/video/1"></iframe></figure>',
      ),
    ).toBe(
      `<figure class="rt-embed rt-embed--vimeo" data-rt-provider="vimeo"><iframe src="https://player.vimeo.com/video/1" title="Vimeo" width="640" height="360" ${FIXED}></iframe></figure>`,
    );
  });

  it('saída de cada provedor é ponto fixo', () => {
    const editor = editorWith();
    editor.commands.setEmbed(`https://youtu.be/${ID}?t=90`, { caption: 'A' });
    editor.commands.setEmbed(`https://www.youtube.com/shorts/${ID}`);
    editor.commands.setEmbed('https://vimeo.com/76979871', { caption: 'B' });
    editor.commands.setEmbed(SPOTIFY_TRACK);
    const out = canonical(editor);
    expect(embedCount(editor)).toBe(4);
    expect(html(out)).toBe(out);
  });

  it('figure com outro conteúdo: o texto fica e o iframe vira embed', () => {
    const out = html(
      `<figure><iframe src="${NOCOOKIE}"></iframe><p>Texto</p><figcaption>Leg</figcaption></figure>`,
    );
    expect(out).toContain('Texto');
    expect(out).toContain('Leg');
    expect(out).toContain(`<iframe src="${NOCOOKIE}"`);
  });

  it('iframe dentro do figcaption não é o iframe da figure', () => {
    const out = html(
      `<figure><figcaption>Leg<iframe src="${NOCOOKIE}"></iframe></figcaption></figure>`,
    );
    expect(out).toContain('Leg');
    expect(out).not.toContain('<figcaption>');
  });

  it('a leitura não muta o DOM e é idempotente (elemento vivo lido duas vezes)', () => {
    const editor = editorWith();
    const element = document.createElement('div');
    const figure = document.createElement('figure');
    figure.setAttribute('class', 'rt-embed');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', `https://www.youtube.com/embed/${ID}`);
    iframe.setAttribute('srcdoc', '<b>x</b>');
    iframe.setAttribute('title', 'b'.repeat(301));
    iframe.setAttribute('style', 'aspect-ratio: 4 / 3');
    const caption = document.createElement('figcaption');
    caption.append('  Leg  ');
    figure.append(iframe, caption);
    const loose = document.createElement('iframe');
    loose.setAttribute('src', 'https://evil.com/');
    element.append(figure, loose);
    const before = element.outerHTML;
    const parser = PMParser.fromSchema(editor.schema);
    const first = parser.parse(element).toJSON();
    expect(element.outerHTML).toBe(before);
    expect(parser.parse(element).toJSON()).toEqual(first);
    expect(element.outerHTML).toBe(before);
    expect(first.content?.[0]?.attrs).toEqual({
      provider: 'youtube',
      src: NOCOOKIE,
      title: 'b'.repeat(300),
      width: 640,
      height: 480,
      aspectRatio: '4 / 3',
      caption: 'Leg',
    });
  });
});

describe('rtEmbed: opções e JSON', () => {
  it('embedProviders: [] → sem rtEmbed e sem setEmbed', () => {
    const names = createEditorExtensions({
      features: ONLY_EMBEDS,
      embedProviders: [],
    }).map((e) => e.name);
    expect(names).not.toContain('rtEmbed');
    const editor = editorWith(`<iframe src="${NOCOOKIE}"></iframe><p>a</p>`, {
      embedProviders: [],
    });
    expect(
      (editor.commands as unknown as Record<string, unknown>)['setEmbed'],
    ).toBeUndefined();
    expect(canonical(editor)).toBe('<p>a</p>');
  });

  it('features.embeds desligado → sem rtEmbed', () => {
    const names = createEditorExtensions({
      features: { ...ONLY_EMBEDS, embeds: false },
    }).map((e) => e.name);
    expect(names).not.toContain('rtEmbed');
  });

  it('provedor do consumidor válido é aceito (e só os ativos valem)', () => {
    const options = { embedProviders: [EXAMPLE] };
    const editor = editorWith('', options);
    expect(editor.commands.setEmbed(`https://youtu.be/${ID}`)).toBe(false);
    expect(editor.commands.setEmbed('https://example.com/watch/42')).toBe(true);
    const out = canonical(editor);
    expect(out).toBe(
      `<figure class="rt-embed rt-embed--example" data-rt-provider="example"><iframe src="https://embed.example.com/v/42" title="Example" width="640" height="360" ${FIXED}></iframe></figure>`,
    );
    expect(html(out, options)).toBe(out);
    expect(
      embedCount(editorWith(`<iframe src="${NOCOOKIE}"></iframe>`, options)),
    ).toBe(0);
  });

  it('JSON com src fora dos provedores → iframe sem src (só falta o src)', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'rtEmbed',
          attrs: { provider: 'youtube', src: 'https://evil.com/' },
        },
      ],
    });
    const out = getRteHtml(editor);
    expect(out).toBe(
      `${YT_FIG}<iframe title="YouTube" width="640" height="360" ${FIXED}></iframe></figure>`,
    );
    expect(
      validateHtml(out, editor.storage.rtContent.schema, { mode: 'accepted' }),
    ).toEqual([
      expect.objectContaining({
        kind: 'missing-required-attribute',
        name: 'src',
      }),
    ]);
    const iframe = editor.view.dom.querySelector('iframe');
    expect(iframe?.hasAttribute('src')).toBe(false);
  });

  it('JSON com provedor desconhecido, src javascript: e atributos ruins é revalidado', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'rtEmbed',
          attrs: {
            provider: '__proto__',
            src: 'javascript:alert(1)',
            title: 5,
            width: -1,
            height: 'x',
            aspectRatio: '0 / 1',
            caption: { a: 1 },
          },
        },
      ],
    });
    const out = getRteHtml(editor);
    expect(out).toBe(
      `<figure class="rt-embed"><iframe title="" width="640" height="360" ${FIXED}></iframe></figure>`,
    );
    expect(
      validateHtml(out, editor.storage.rtContent.schema, { mode: 'accepted' }),
    ).toEqual([
      expect.objectContaining({
        kind: 'missing-required-attribute',
        name: 'src',
      }),
    ]);
  });

  it('JSON com src válido de outro provedor: provedor vem do src', () => {
    const editor = editorWith({
      type: 'doc',
      content: [
        {
          type: 'rtEmbed',
          attrs: {
            provider: 'vimeo',
            src: NOCOOKIE,
            width: 560,
            height: 315,
            aspectRatio: '16 / 9',
          },
        },
      ],
    });
    expect(canonical(editor)).toBe(
      `${YT_FIG}${ytIframe('width="560" height="315"')}</figure>`,
    );
  });
});
