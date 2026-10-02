# e2e (Playwright)

Rodar: `npx playwright test -c e2e --project=chromium`

Firefox e WebKit estão declarados em `playwright.config.ts`, mas sem testes: entram na spec 08 (a regex `@nonexistent-until-spec-08` impede a execução). `npx playwright test -c e2e` sem `--project` também passa (só roda o Chromium).

## Variáveis

- `BASE_URL`: URL a testar (padrão: `file://` de `fixtures/blank.html`). Aponta para um servidor já no ar.
- `CHROME`: caminho de um binário Chromium/Chrome alternativo (`launchOptions.executablePath`). Opcional; sem ele o Playwright usa o navegador de `~/.cache/ms-playwright`.
- `LD_LIBRARY_PATH`: necessário em WSL/Ubuntu sem as libs do Chromium.

## Setup (uma vez)

```bash
npx playwright install chromium        # baixa para ~/.cache/ms-playwright
```

Se falhar com `error while loading shared libraries: libnspr4.so` (WSL sem sudo), extrair as libs de `.deb` numa pasta sob `$HOME` (não `/tmp`):

```bash
mkdir -p ~/.cache/playwright-libs/debs && cd ~/.cache/playwright-libs/debs
apt-get download libnspr4 libnss3 libasound2t64   # Ubuntu 24.04+; em versões antigas: libasound2
for d in *.deb; do dpkg -x "$d" ../root; done
```

## Execução (procedimento que funcionou)

```bash
export LD_LIBRARY_PATH=$HOME/.cache/playwright-libs/root/usr/lib/x86_64-linux-gnu
# opcional: export CHROME=/caminho/para/chrome
npx playwright test -c e2e --project=chromium
```
