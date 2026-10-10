#!/usr/bin/env bash
# Executa um comando com as bibliotecas de sistema do Chromium, Firefox e WebKit
# extraídas em $HOME/.cache/playwright-libs/root (WSL/Ubuntu sem sudo; ver e2e/README.md).
# Uso: e2e/with-browser-libs.sh npx playwright test -c e2e
# Variável opcional: RTE_BROWSER_LIBS_ROOT (padrão: $HOME/.cache/playwright-libs/root).
set -euo pipefail

root="${RTE_BROWSER_LIBS_ROOT:-$HOME/.cache/playwright-libs/root}"
if [ ! -d "$root" ] || [ -z "$(ls -A "$root" 2>/dev/null)" ]; then
  echo "Erro: bibliotecas dos navegadores não encontradas em $root; veja e2e/README.md (seção WSL)." >&2
  exit 1
fi
export LD_LIBRARY_PATH="$root/usr/lib/x86_64-linux-gnu:$root/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# O Playwright valida libGLESv2/libx264 (dlopen) via `ldconfig -p`, que não enxerga a pasta acima.
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

# O wrapper do WebKit (minibrowser-*/MiniBrowser) sobrescreve LD_LIBRARY_PATH; faz com que preserve o valor herdado.
# Idempotente; é refeito após `npx playwright install` baixar uma nova versão do WebKit.
shopt -s nullglob
wrappers=("$HOME"/.cache/ms-playwright/webkit-*/minibrowser-*/MiniBrowser)
if [ "${#wrappers[@]}" -eq 0 ]; then
  echo 'Aviso: WebKit não instalado; rode `npx playwright install webkit`.' >&2
fi
for w in "${wrappers[@]}"; do
  grep -q 'LD_LIBRARY_PATH:+' "$w" && continue
  [ -e "$w.rte-orig" ] || cp -p "$w" "$w.rte-orig"
  sed -i 's|^export LD_LIBRARY_PATH="\(.*\)"$|export LD_LIBRARY_PATH="\1${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"|' "$w"
  if ! grep -q 'LD_LIBRARY_PATH:+' "$w"; then
    echo "Aviso: não foi possível ajustar $w (formato mudou?). O WebKit pode falhar com 'error while loading shared libraries'. Para restaurar: cp $w.rte-orig $w" >&2
  fi
done

exec "$@"
