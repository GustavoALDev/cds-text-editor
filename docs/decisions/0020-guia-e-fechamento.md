# ADR 0020: Guia, README raiz, teste de 15 minutos e fechamento da spec 07

- Status: aceita (2026-10-08); critério do teste de 15 minutos aberto (ver "Pendências com dono")
- Spec de origem: `docs/specs/07d-guia-e-fechamento.md` (parte 4 de 4 da spec 07)

## Contexto

A 07c entregou a infraestrutura do site (ADR 0018) e a 07b o demo (ADR 0017). A 07d escreve o guia (16 páginas), gera o README raiz a partir do Início rápido, ensaia o teste de 15 minutos e fecha a spec 07. O PR #21 (revisão de segurança R9) entrou no `main` no meio da parte e obrigou a rever as páginas de envio, segurança e migração.

## Decisão

### (a) Decisões da spec

L1–L13 valem como escritas na spec. Concretizações e desvios:

1. **Páginas e nomes finais** (`apps/docs/content/guia/`): `inicio-rapido`, `instalacao`, `configuracao`, `formularios`, `barra-e-recursos`, `idiomas`, `tema`, `envio-e-midia`, `embeds`, `exibicao`, `seguranca`, `ssr-e-csp`, `navegadores`, `desempenho`, `migracao`, `faq`, agrupadas em quatro seções em `nav.json`. O guia orienta e linka os READMEs e `api/<entry>`; não copia tabelas (L2). A página `navegadores` diz "matriz de verificação", não "suporte".
2. **README raiz gerado** (L6): marcadores `<!-- readme: ... -->` reescritos por `UPDATE_README=1 node tools/docs-content.mjs`; sem a variável o comando compara e falha com a diferença. Cada pacote tem uma linha "Guia:" com link relativo.
3. **CSS dos exemplos** (L4): regiões `/* #region */` e arquivos globais `apps/docs/src/styles/exemplos*.css` acrescentados depois de `docs.css`, com classe envolvente, nunca `:root`.
4. **`?preset=` no demo** (L7): lista fechada de ids de `RTE_THEME_PRESETS`, lido só no navegador após a renderização, sem escrever na URL; repetido ou inválido é ignorado (J7). Resolve a pendência do ADR 0017.
5. **Kit** (L9, L10): `node tools/kit.mjs` gera `dist/rte-kit-<sha>.zip` sem dependência nova (zip escrito com `node:zlib`), com os tarballs do `consumer.mjs pack`, `manifest.json`, `examples/server-node` e um `LEIA-ME.txt` de uma regra só. O `LEIA-ME.txt` deixa de existir na spec 09 (comando de instalação real).
6. **Revisão R9 refletida no guia:** o servidor de exemplo exige `AUTH_TOKEN` (ou `ALLOW_ANON=1`), `/csrf` exige bearer, token CSRF ligado à sessão e buscado uma vez pelo adaptador, carência de órfãs de 7 dias; `idPrefix` precisa terminar em hífen (quebra registrada em `migracao`); `linkPolicy.protocols`/`allowRelative` valem no sanitizador. As páginas linkam `docs/security.md` em vez de copiá-lo.

### (b) Rodada 0 (ensaio, L9)

Um agente sem contexto do repositório seguiu o guia, o site servido e o kit, num app novo (`ng new` com Angular 22.2.1, sem SSR), e atingiu os 3 marcos em cerca de 6 minutos com Playwright. Achou 8 tropeços (4 de atraso, 3 cosméticos, 1 de ambiente), todos corrigidos no guia (passo "Enviar imagens", comando com render e sanitizer, nomes dos arquivos, aviso sobre `budgets` do `ng build`, `proxyConfig`, `MEDIA_DIR`, onde está o servidor, token do exemplo); nenhum era defeito de pacote. Detalhes em `docs/usabilidade/teste-15-minutos.md`. O ensaio **não fecha** o critério: o agente não mede leitura humana.

### (b2) Defeitos achados na verificação final

- O demo montado para o Pages tinha `<img src="/exemplo.png">` fora da base na página de exibição (apontado pelo `check-links --demo-root`): o exemplo agora usa a base do documento (`PlatformLocation`).
- O I4 pegava a FAQ como primeiro resultado de `provideRich` depois das páginas novas: o teste agora escolhe a opção da API pelo título.

### (c) Divergências da §3 da spec 07

- O servidor de exemplo não usa Express nem SQLite (Node puro, sem dependência; README do `examples/server-node`).
- A documentação não usa TypeDoc nem Compodoc: ferramenta própria sobre o `api-extractor` (ADR 0018).

### (d) O que fica para depois (L12)

- Spec 08: matriz suportada medida no lugar da página `navegadores`, leitores de tela reais, teclado virtual.
- Spec 09: repetição curta do teste com o registro real, versionamento do site, comando de instalação real, domínio e Pages (`TODO-AUTOR`).
- Tradução do guia: sem dono.

## Pendências com dono

| Pendência | Dono |
|---|---|
| Rodada 1 do teste de 15 minutos com pessoa externa (aprovação: <= 15:00 sem intervenção; no máximo 3 rodadas) | dono do projeto (`TODO-AUTOR`) |
| Rodada de CI do PR da 07d (E2E nos 3 motores, jobs `docs` e `demo`) | dono do projeto |
| Publicação no Pages e URL do site (`vars.RTE_PAGES`) | dono do projeto (`TODO-AUTOR`) |
| Instalação pede npm 7+ mas o repositório exige npm 11 (o ensaio funcionou com npm 10) | spec 09 |

## Riscos aceitos

Sem pessoa externa, o critério de 15 minutos permanece aberto e a spec 07 não é marcada como concluída. O ensaio interno usa um agente, que é rápido por natureza; o tempo real de uma pessoa será maior.

## Consequências

Mudar comportamento ensinado no guia quebra um exemplo compilado ou o I7; mudar o Início rápido muda o README raiz (o job `docs` acusa). O guia depende de `docs/security.md` para a lista de deveres do servidor.
