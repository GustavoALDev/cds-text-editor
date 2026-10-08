# Teste de 15 minutos: registro

Critério da spec 07 (§5) e protocolo da spec 07d (L10). O roteiro está em [`roteiro-teste-15-minutos.md`](roteiro-teste-15-minutos.md) e a planilha bruta em [`planilha-registro.csv`](planilha-registro.csv). A rodada 0 é um ensaio interno e **não fecha o critério**.

## Preparação (comum às rodadas)

- Kit: `node tools/kit.mjs` gera `dist/rte-kit-<sha>.zip` (tarballs, `manifest.json`, `examples/server-node`, `LEIA-ME.txt`).
- Site: `node apps/docs/serve.mjs --dir <browser/> --base /cds-text-editor/` (ou o Pages, `TODO-AUTOR`).
- App: `npx -y @angular/cli@22.2.1 new app --defaults --skip-git` (CSS, zoneless, sem SSR).

## Rodada 0 (ensaio interno, agente sem contexto do repositório)

- Perfil: agente de IA sem acesso ao código; só site, kit e documentação do Angular. Kit `rte-kit-b2cff63.zip`, sha256 iniciado em `1e2303090129cd73`.
- Tempos (Chromium + Playwright, nos 3 marcos): editor aceita texto em cerca de 5 min; imagem PNG enviada ao servidor de exemplo no editor em cerca de 6 min; mesmo conteúdo em `[rteContent]` em cerca de 6 min. Total cerca de 6 min, sem intervenção. O ensaio não mede leitura humana.
- Tropeços (a primeira tentativa, interrompida por problema de infraestrutura antes do `ng new`, só leu o guia e achou os mesmos itens de comando e de arquivos):

| Minuto | Página | Tropeço | Gravidade | Correção |
|---|---|---|---|---|
| 0 | inicio-rapido | Nada leva ao marco 2: sem passo de envio nem link para Envio e mídia | atraso | passo 6 e link (commit desta rodada) |
| 1 | inicio-rapido | Comando de instalação sem `rte-render` e `rte-sanitizer`, usados no passo 5 | atraso | comando no passo 1 (idem) |
| 0 | inicio-rapido | Passos 4 e 5 não dizem o nome dos arquivos | cosmético | nomes nos passos (idem) |
| 3 | inicio-rapido | `ng build` de produção falha: bundle inicial 1,14 MB acima do orçamento de 1 MB do `ng new` | atraso | aviso sobre `budgets` no passo 2 (idem) |
| 3 | envio-e-midia | Proxy sem `proxyConfig` no `angular.json`, sem `MEDIA_DIR` e sem dizer de onde rodar o servidor | cosmético | texto acrescentado (idem) |
| 3 | envio-e-midia | Onde está o servidor de exemplo sem o repositório | cosmético | texto e `LEIA-ME.txt` do kit (idem) |
| 3 | envio-e-midia | Token do exemplo diferente do `AUTH_TOKEN` | cosmético | exemplo usa `outro-segredo` (idem) |
| 5 | ambiente | Chromium do Playwright em outra revisão | ambiente | não aplicável |

Os commits das correções são os de `docs(guia): correções da rodada 0` desta branch. Pendência observada: Instalação pede npm 7+ e o repositório exige npm 11; no ensaio o `npm install` dos tarballs funcionou com npm 10.

## Rodada 1 (externa)

`TODO-AUTOR`: pessoa externa (perfil e data), tempo total e por marco, tropeços e correções. O critério da spec 07 fica **aberto** até esta rodada; dono: o dono do projeto.
