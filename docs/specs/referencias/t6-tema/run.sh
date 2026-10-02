#!/usr/bin/env bash
# Roda o spike T6: contraste (sRGB e fora do gamut), plano B (JS) x nativo, comportamentos e modos.
# Requer: node, python3, playwright-core e um Chromium. Defina CHROME=/caminho/do/chrome-headless-shell.
# Se faltarem bibliotecas do sistema (libnspr4, libnss3, libasound2), extraia os .deb numa pasta e use LD_LIBRARY_PATH.
set -euo pipefail
cd "$(dirname "$0")"
: "${CHROME:?defina CHROME com o caminho do chromium/chrome-headless-shell}"

echo "=== 1) Contraste, cores DENTRO do sRGB (223 cores x 2 modos) ==="
python3 make-seeds.py && node harness.mjs theme.css >/dev/null && python3 analyze.py -v
echo; echo "=== 2) Plano B (JS) x nativo: diferença de cor (ΔE OKLab) e contraste ==="
node compare.mjs && cp results.json results_native.json && cp results_js.json results.json && python3 analyze.py && cp results_native.json results.json
echo; echo "=== 3) Contraste, cores FORA do sRGB (oklch/p3) ==="
python3 make-seeds.py wide && node harness.mjs theme.css >/dev/null && python3 analyze.py -v
echo; echo "=== 4) Comportamentos (inválido, formatos, prioridade, camadas, neutros, custo) ==="
node extra.mjs
echo; echo "=== 5) Modos (auto x inherit x forçado) ==="
node modes.mjs
rm -f results.json results_js.json results_native.json seeds.json
