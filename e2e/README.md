# e2e (Playwright)

Rodar nos 3 navegadores (chromium, firefox, webkit): `npx playwright test -c e2e`. Em WSL/Ubuntu sem sudo, use o helper: `e2e/with-browser-libs.sh npx playwright test -c e2e` (ver "WSL" abaixo). Um projeto só: `--project=firefox`.

## Variáveis

- `BASE_URL`: URL a testar (padrão: `file://` de `fixtures/blank.html`). Aponta para um servidor já no ar.
- `CHROME`: caminho de um binário Chromium/Chrome alternativo (`launchOptions.executablePath`). Opcional; sem ele o Playwright usa o navegador de `~/.cache/ms-playwright`.
- `LD_LIBRARY_PATH`: necessário em WSL/Ubuntu sem as libs dos navegadores (o helper define).

- `E2E_NETWORK=1`: liga `e2e/core/embeds.spec.ts` (YouTube, Vimeo e Spotify de verdade; precisa de rede). O CI não define; sem ela o spec é pulado.

## Setup (uma vez)

```bash
npx playwright install chromium firefox webkit   # baixa para ~/.cache/ms-playwright
```

Com sudo: `npx playwright install --with-deps` instala também as libs de sistema e basta.

## WSL sem sudo

Extrair as libs de `.deb` numa pasta sob `$HOME` (não `/tmp`):

```bash
mkdir -p ~/.cache/playwright-libs/debs && cd ~/.cache/playwright-libs/debs
apt-get download libnspr4 libnss3 libasound2t64   # Ubuntu 24.04+; em versões antigas: libasound2
# Firefox/WebKit: depois de definir PKGS (bloco abaixo), rode: apt-get download $PKGS
for d in *.deb; do dpkg -x "$d" ../root; done
```

Pacotes de Firefox e WebKit (além dos do Chromium; Ubuntu com libs 1.28 do GStreamer):

```bash
PKGS="libgtk-4-1 libgtk-4-common libgraphene-1.0-0 libsoup-3.0-0 libsoup-3.0-common \
libsecret-1-0 libsecret-common libmanette-0.2-0 libenchant-2-2 libhyphen0 libharfbuzz-icu0 \
libharfbuzz-subset0 libwoff1 libavif16 libwebp7 libwebpdemux2 libwebpmux3 libjpeg-turbo8 \
libjpeg8 libopenjp2-7 libtiff6 libxslt1.1 libflite1 libopus0 libevent-2.1-7t64 \
libbacktrace0 libgles2 libwayland-server0 libgudev-1.0-0 libevdev2 libhidapi-hidraw0 \
libdecor-0-0 libunibreak6 libxkbcommon-x11-0 libxcb-xkb1 libxss1 libjson-glib-1.0-0 \
libjson-glib-1.0-common glib-networking glib-networking-common glib-networking-services \
libgstreamer-plugins-base1.0-0 libgstreamer-plugins-bad1.0-0 libgstreamer-plugins-extra1.0-0 \
libgstreamer-gl1.0-0 libabsl20260107 liblerc4 libdeflate0 libjbig0 libdav1d7 \
libgav1-2 liborc-0.4-0t64 libyuv0 libcairo-script-interpreter2"
```

Os nomes dos pacotes (libabsl…, versões do GStreamer etc.) são os do Ubuntu usado aqui e podem diferir em outras versões.

Para achar o que falta numa versão nova do Playwright: `ldd` nos binários de `~/.cache/ms-playwright/{firefox-*/firefox,webkit-*/minibrowser-wpe/bin}` com o `LD_LIBRARY_PATH` abaixo, procurando `not found`, e `apt-get download` do pacote que fornece a lib (`npx playwright install-deps --dry-run` lista os nomes).

`LD_LIBRARY_PATH` que cobre os três navegadores:

```bash
export LD_LIBRARY_PATH=$HOME/.cache/playwright-libs/root/usr/lib/x86_64-linux-gnu:$HOME/.cache/playwright-libs/root/lib/x86_64-linux-gnu
```

`e2e/with-browser-libs.sh` (variável opcional `CDS_BROWSER_LIBS_ROOT` troca a pasta das libs; falha com mensagem clara se ela não existir) faz isso e mais duas coisas necessárias no WebKit:

- `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`: a validação de dependências do Playwright consulta `ldconfig -p` (libGLESv2, libx264), que não enxerga a pasta extraída.
- Edita o wrapper `~/.cache/ms-playwright/webkit-*/minibrowser-*/MiniBrowser`, que sobrescreve o `LD_LIBRARY_PATH`, para preservar o valor herdado (idempotente; guarda uma cópia única em `MiniBrowser.cds-orig` e avisa se o ajuste não pegar; refeito a cada execução, útil após atualizar o WebKit).

## Specs do core (`e2e/core`)

- `url-parity.spec.ts`: paridade das funções de URL do core com o `URL` de cada motor; `embeds.spec.ts`: embeds reais (só com `E2E_NETWORK=1`). Usam `helpers/page.ts` (`window.RteCore`).
- Editor da 03b (E1–E6 da spec 03b, §7.6), com `helpers/editor-page.ts`: bundle IIFE `window.RteEditorLab` (`helpers/editor-bundle.ts`, gerado uma vez por worker), página em `https://rte.test` com o PNG 1×1 em `/e2e.png` e toda outra requisição abortada, editor da fábrica em `#editor` como `window.editor`.
  - `editor-contract.spec.ts` (E1): `fixtures/content/all-features.html` é ponto fixo de `getRteHtml`; `editor.getHTML()` é aceito pelo esquema e só difere na forma/posição do `style` (Chromium e WebKit o movem para o fim) e nos ids.
  - `editor-paste.spec.ts` (E2): cada caso de `fixtures/content/tolerant-cases.json` por `view.pasteHTML`.
  - `editor-resize.spec.ts` (E3): as 4 alças com o mouse real, `minWidth`, `Escape`, um passo de desfazer, captura de ponteiro e nenhum `dragstart` nativo.
  - `editor-tasks.spec.ts` (E4): clique, `Tab` e `Space` no checkbox, `aria-label`, `Enter`/`Backspace` nos itens. No Firefox o `Tab` parte do cursor (por isso o teste começa num parágrafo antes da lista).
  - `editor-highlight.spec.ts` (E5): gramática carregada sob demanda (só a usada), decorações `hljs-*` e a saída sem `hljs`.
  - `editor-links.spec.ts` (E6): autolink ao digitar e ids de título na carga inicial.
- Editor da 03c (E8–E11 da spec 03c, §6.3): o bundle também expõe `getRteTextStats`, `getCharLimitState`, `getSearchState`, `getSlashMenuState` e `htmlToText`; a página ganha CSS mínimo para `rte-placeholder` (`::before` com `attr(data-placeholder)`), `rte-search-match` (ativo distinto) e `rte-slash-query`.
  - `editor-contract.spec.ts` (E1, R7): com a busca por `a` ativa, `getRteHtml` continua o fixture e `getHTML()` não muda.
  - `editor-placeholder.spec.ts` (E8): `::before` computado e `aria-placeholder` no documento vazio; digitar remove, `Mod+A` + `Backspace` devolve; título vazio de caixa mostra o rótulo; nada vaza para o HTML.
  - `editor-char-limit.spec.ts` (E9): tecla recusada no limite (modelo e DOM), `rejected`, `Backspace`, colagem cortada, `setContent` acima com `overLimit`; IME por CDP (`Input.imeSetComposition`/`insertText`) só no Chromium, pulado nos outros com o motivo.
  - `editor-search.spec.ts` (E10): decorações visíveis e ativo distinto; `previousSearchMatch` com o foco fora do editor seleciona e rola até o último resultado; substituir tudo e um `Mod+Z`. Mede também o R8 (2000 parágrafos × 10 palavras, busca e limite ligados, 50 teclas pelo caminho de `handleTextInput`): mediana e p95 vão para as anotações (`R8`) e o console; só `mediana < 1000 ms` é conferida (informativo).
  - `editor-slash.spec.ts` (E11): `/` digitado no início, depois de espaço e de U+00A0 abre, depois de letra e em bloco de código não; `Backspace` real; `/tab` filtra, `ArrowDown` + `Enter` inserem a tabela válida e um `Mod+Z` volta a `/tab`; `Escape` fecha sem reabrir; `Enter` com o menu aberto não divide o parágrafo.
- Rodar só o core: `npx playwright test -c e2e e2e/core --workers=4` (mais workers deixam o Firefox instável no Windows).
