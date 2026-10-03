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
