// Sem imports: a página `media` (Angular) e os specs do Playwright leem o mesmo
// documento inicial.

/**
 * Documento inicial do `media` (N25-N31): imagem com `alt`, imagem SEM `alt`
 * (V7: abre o "Image details…" com texto e "decorativa" em branco), vídeo WebM
 * com uma faixa de legenda, o *embed* do YouTube que `toEmbed` produz e um
 * parágrafo final. WebM + `.vtt` (sem MP4, ruling 6 do ADR 0011).
 *
 * É a forma canônica de `getRteHtml` com duas diferenças, que o N30 normaliza:
 * a imagem sem `alt` sai com `alt=""` (o HTML canônico não distingue) e o
 * `iframe` sai com `style="aspect-ratio: 16 / 9"`. Esse `style` fica fora do
 * fixture: o Chromium relata `style-src-attr` ao carregar conteúdo com o
 * atributo (ruído só de relatório, ruling 28 do ADR 0007), e os testes exigem
 * `window.__violations` vazio.
 */
export const MEDIA_FIXTURE =
  '<p>Mídia</p>' +
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="Imagem de teste" loading="lazy" decoding="async"></figure>' +
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" loading="lazy" decoding="async"></figure>' +
  '<figure class="rt-figure rt-figure--video"><video src="/e2e.webm" controls="" preload="metadata" playsinline=""><track kind="captions" src="/e2e.vtt" srclang="pt-BR" label="Português"></video></figure>' +
  '<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" width="560" height="315" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen="" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe></figure>' +
  '<p>Fim</p>';

/** O que `getRteHtml` devolve para o `MEDIA_FIXTURE` (as duas diferenças acima). */
export const MEDIA_FIXTURE_OUT = MEDIA_FIXTURE.replace(
  '<img src="/e2e.png" loading="lazy"',
  '<img src="/e2e.png" alt="" loading="lazy"',
).replace(
  'height="315" loading="lazy"',
  'height="315" style="aspect-ratio: 16 / 9" loading="lazy"',
);
