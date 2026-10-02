#!/usr/bin/env bash
# Executa um comando com as bibliotecas de sistema do Chromium, Firefox e WebKit
# extraídas em $HOME/.cache/playwright-libs/root (WSL/Ubuntu sem sudo; ver e2e/README.md).
# Uso: e2e/with-browser-libs.sh npx playwright test -c e2e
root="$HOME/.cache/playwright-libs/root"
export LD_LIBRARY_PATH="$root/usr/lib/x86_64-linux-gnu:$root/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# O Playwright valida libGLESv2/libx264 (dlopen) via `ldconfig -p`, que não enxerga a pasta acima.
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

# O wrapper do WebKit (minibrowser-*/MiniBrowser) sobrescreve LD_LIBRARY_PATH; faz com que preserve o valor herdado.
# Idempotente; precisa ser refeito após `npx playwright install` baixar uma nova versão do WebKit.
for w in "$HOME"/.cache/ms-playwright/webkit-*/minibrowser-*/MiniBrowser; do
  [ -f "$w" ] && ! grep -q 'LD_LIBRARY_PATH:+' "$w" &&
    sed -i 's|^export LD_LIBRARY_PATH="\(.*\)"$|export LD_LIBRARY_PATH="\1${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"|' "$w"
done

exec "$@"
