# ADR 0023: API estável, versionamento sem publicação e prontidão para a 1.0

- Status: aceita (2026-10-09)
- Spec de origem: `docs/specs/09c-api-estavel-e-prontidao.md` (parte 3 de 3 da spec 09); plano `docs/superpowers/plans/2026-10-08-api-estavel-09c.md`
- O ADR 0022 fica **reservado à publicação da 09b** (adiada); não há ADR a receber adendo.

## Contexto

A 09c fecha a superfície pública dos 5 pacotes (TypeScript, CSS e HTML gravado) num estado prometível por semver, põe dependências e versões num estado coerente para a primeira versão **sem publicar**, escreve a política de suporte e depreciação, liga guardas de API ao CI e deixa uma lista de prontidão que separa o que é do agente do que é do dono. Nenhum recurso novo e nenhum teste de navegador novo: as suítes existentes provam que a renomeação foi completa. Publicação no npm, nome e escopo, consumidor real e teste de 15 minutos continuam adiados (`TODO-AUTOR`).

## Decisão

### (a) Decisões AP1 a AP15

Todas tomadas como na spec, salvo os desvios da seção (b).

| #    | Decisão                                                                                                                 | Onde está                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| AP1  | Superfície pública = relatórios TS, relatórios CSS, esquema do HTML gravado e seletores/entradas/saídas dos componentes | `docs/support.md`                                                          |
| AP2  | Prefixo `Rte`/`RTE_` em tudo que não é função; conferido sobre os relatórios; **lista de exceções vazia**               | `tools/api-report.mjs` (`checkPrefixConvention`, `PREFIX_EXCEPTIONS = []`) |
| AP3  | Renomeações e remoções da lista fechada, sem alias nem `@deprecated` (seção (c))                                        | 07fddb2, 179cc45, 8d13760                                                  |
| AP4  | `readonly`, `RteHeadingLevel`, `RteSchemaLinkPolicy`; conferência de opções sem uso (seção (d))                         | c2074c5, 58a9519                                                           |
| AP5  | Tipos de terceiros aceitos e documentados; Signal Forms conferidos estáveis no Angular 22                               | `docs/support.md`                                                          |
| AP6  | Internos exportados e reexportações intencionais (seção (e))                                                            | `docs/support.md`                                                          |
| AP7  | Relatórios CSS (`*.css-api.md`) e `css-public.json` por pacote no alvo `api`                                            | `tools/css-api.mjs`                                                        |
| AP8  | `@packageDocumentation` nos 15 entries e zero `(undocumented)` fora de `Rte*Labels`                                     | `tools/api-report.mjs` (`checkDocumentation`)                              |
| AP9  | Congelamento e guarda `api-diff` no CI                                                                                  | `tools/api-diff.mjs`, `ci.yml`                                             |
| AP10 | Política de depreciação                                                                                                 | `docs/support.md`                                                          |
| AP11 | Suporte a Angular 22 (peers `>=22.2.1 <23`), regra para o Angular 23 e para o Tiptap                                    | `docs/support.md`                                                          |
| AP12 | Dependências internas exatas em `dependencies`, sem peer interno                                                        | `packages/*/package.json`, `checkInternalDeps`                             |
| AP13 | `fixed` com os 5, `release-plan` e 5 changesets consolidados                                                            | `.changeset/`, `tools/release-plan.mjs`                                    |
| AP14 | `docs/release/prontidao-1.0.md` e a regra `checkProntidao`                                                              | seção (h)                                                                  |
| AP15 | Seis tarefas na ordem do plano (T1 a T6)                                                                                | commits da branch `feat/spec-09c`                                          |

**Ruling do dono (2026-10-08):** `provideRichText` é **mantido** (nem renomeado nem com alias): `provideRteEditor` seria redundante ("rich text editor editor"). O componente segue `rte-editor`/`RteEditor`.

### (b) Desvios e fatos registrados pelas tarefas

- **T1, spike do consumidor:** `tools/consumer.mjs` deduplica o core sozinho: instalar os 5 tarballs deixa **uma versão só** de `@cds/rte-core` (a do tarball). Nem `overrides` nem instalação conjunta no mesmo comando (as reservas da spec) foram necessários. `changeset status` com os 34 changesets antigos já planejava os 5 em `0.1.0`: o `fixed` sobe o theme (que tinha só um changeset `patch`) para `0.1.0`.
- **T1:** o peer opcional `@cds/rte-sanitizer` do `render` saiu (o `render` não o importa); `angular` depende de `core` e `theme`, `sanitizer` de `core` e `render` de `core`, todos em `dependencies` com versão exata; os `ng-package.json` de `angular` e `render` ganharam `allowedNonPeerDependencies`.
- **T2:** o `check:rules` só vê arquivos **rastreados** (`git ls-files`); sem git, percorre a árvore. Ficam de fora da regra de nomes antigos: `docs/decisions`, `docs/specs`, `docs/superpowers`, o próprio `check-repo-rules` e seu teste, o lockfile e o `THIRD-PARTY-NOTICES.md`. A regra casa palavra inteira (não casa `RteDraftStoreFoo`, `clearLocalDrafts` nem `RteRgb`). O comando de instalação do README raiz foi regenerado (`UPDATE_README=1`), sem os pacotes internos como peers (a490c89).
- **T2:** `extractToc` agora **ignora níveis fora de 2 a 4**, para o tipo `RteHeadingLevel` valer em tempo de execução.
- **T3:** o `@packageDocumentation` é **lido do fonte** do entry e injetado numa cópia temporária `*.pkgdoc.d.ts`, porque os `.d.ts` empacotados de tsup e ng-packagr o descartam. Isenções da AP8: membros de interfaces `Rte*Labels` (documentadas no nível da interface) e estáticos `ɵ` gerados pelo Angular. 328 itens documentados; relatórios regravados só com comentários novos e sem `(undocumented)`.
- **T4:** o relatório CSS tem a chave `consumed` para variáveis que o CSS lê mas nenhum CSS declara (gancho do consumidor, p. ex. `--rte-scroll-margin`). `css-public.json` foi derivado da tabela do README do tema e dos tokens citados no guia e nos READMEs (completar a lista, nunca afrouxar a regra). O `api-diff` compara **por declaração/membro** e ignora EOL, espaços e comentários do api-extractor; `@deprecated` novo conta como acréscimo; mudança para `@internal` conta como alteração; vale também para `*.css-api.md` (só itens `public`) e `docs/html-schema.md` (por linha de tabela). A guarda roda **só em `pull_request`** (base por `env`).
- **T4, limitações conhecidas:** (1) token citado no guia que nenhum CSS declara não é detectado; (2) o `api-diff` só enxerga changesets **commitados** (localmente, `--base main` falhava para o theme até o changeset existir, o que a T5b resolveu).
- **T5a:** Signal Forms conferidos estáveis no Angular 22 (`@publicApi 22.0`; só a integração WebMCP é experimental e a lib não a usa), então o `/validators` não declara exceção. `SECURITY.md` não cita canal de distribuição (`TODO-AUTOR`: canal, _dist-tag_ e nome do pacote).
- **T5b:** 34 changesets viraram **5** (um por pacote, `minor`, pt-BR, com seção Segurança; notas R9 e H8 preservadas). O mapeamento antigo para novo está no corpo do commit 553ae03. Teste novo em `tools/release-plan.test.mjs`: exatamente 5 changesets, `minor`, com Segurança e sem nome antigo.
- **T6:** `docs/release/prontidao-1.0.md` e a regra `checkProntidao`. O critério dos 14 dias fica **aberto** com data mínima (seção (h)).
- **Exceções pontuais do `api-diff`:** nenhuma.
- **Windows:** o checkout com `autocrlf` gera EOL CRLF nos relatórios; o `api-diff` normaliza EOL, e o teste do README raiz também (408f908).

### (c) Lista fechada da AP3 (antigo para novo)

| Entry              | Antigo                                                          | Novo                                                                     |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| core `.`           | `DEFAULT_ID_PREFIX`                                             | `RTE_DEFAULT_ID_PREFIX`                                                  |
| core `.`           | `DEFAULT_LINK_POLICY`                                           | `RTE_DEFAULT_LINK_POLICY`                                                |
| core `.`           | `DraftStorage`, `DraftStore`, `DraftStoreOptions`               | `RteDraftStorage`, `RteDraftStore`, `RteDraftStoreOptions`               |
| core `.`           | `SrcsetCandidate`                                               | `RteSrcsetCandidate`                                                     |
| core `/embeds`     | `DEFAULT_EMBED_PROVIDERS`                                       | `RTE_EMBED_PROVIDERS`                                                    |
| core `/embeds`     | `YOUTUBE_PROVIDER`, `VIMEO_PROVIDER`, `SPOTIFY_PROVIDER`        | `RTE_YOUTUBE_PROVIDER`, `RTE_VIMEO_PROVIDER`, `RTE_SPOTIFY_PROVIDER`     |
| core `/extensions` | `SerializeRteHtmlOptions`                                       | `RteSerializeHtmlOptions`                                                |
| core `/html`       | `ExtractTocOptions`, `HtmlToTextOptions`, `ValidateHtmlOptions` | `RteExtractTocOptions`, `RteHtmlToTextOptions`, `RteValidateHtmlOptions` |
| theme              | `ApplyRteThemeOptions`                                          | `RteApplyThemeOptions`                                                   |
| theme              | `CheckThemeOptions`                                             | `RteCheckThemeOptions`                                                   |
| theme              | `CreateRteThemeOptions`                                         | `RteCreateThemeOptions`                                                  |
| theme              | `SuggestRteColorOptions`                                        | `RteSuggestColorOptions`                                                 |
| theme              | `ColorParser`, `Rgb`                                            | `RteColorParser`, `RteRgb`                                               |

**Removidos:** `CORE_VERSION`, `SANITIZER_VERSION`, `THEME_VERSION`, `RENDER_VERSION` (fixos em `'0.0.0'`, sem fonte de verdade; a versão se lê do `package.json`/`npm ls`) e `ANGULAR_DEFAULTS` (igual a `RTE_THEME_PRESETS.angular`, que passou a ser o único lugar; o demo, os testes e o README usam o preset). A regra de nomes antigos do `check:rules` reprova todos eles fora de ADR/spec. **Mantido:** `provideRichText`.

### (d) AP4: tipos de entrada e opções sem uso

- `RteHeadingLevel = 2 | 3 | 4` (core `.`, reexportado em `/html` e `/extensions`) em `RteHeading.level`, `RteTocEntry.level`, `RteExtractTocOptions.levels` e `RteToc.levels` (render).
- `RteSchemaLinkPolicy`: interface nomeada do antigo objeto anônimo de `RteHtmlSchemaOptions.linkPolicy`.
- `readonly T[]` em `RteEmbedProvider.hosts`/`srcPatterns`, `RteLinkPolicy` (`protocols`, `defaultRel`, `forceRel`, `blockedDomains`), `RteVideoAttrs.tracks`, `RteExtractTocOptions.levels` e no parâmetro de `formatSrcset`. Ficam de fora (saída, não entrada): listas dos tipos do esquema (`RteElementSpec`, `RteHtmlSchema`, `RteUrlRule`) e os rótulos do angular.
- **Opções removidas: lista vazia.** Foram conferidas, por `git grep`, as propriedades opcionais de `RteEditorOptions`, `RteHtmlSchemaOptions`, `RteSchemaLinkPolicy`, `RteSearchOptions`, `RteSerializeHtmlOptions`, `RteSlashOptions`, `RteExtractTocOptions`, `RteHtmlToTextOptions`, `RteValidateHtmlOptions`, `RteDraftStoreOptions`, `RteSanitizeOptions`, `RteRenderOptions`, `RteApplyThemeOptions`, `RteCheckThemeOptions`, `RteCreateThemeOptions`, `RteSuggestColorOptions`, `RteConfig`, `RteCountersConfig`, `RteDraftConfig`, `RteUploadConfig`, `RteHttpUploadOptions`, `RteSafeLinksOptions` e `RteEditorConfig`: todas têm leitura em produção e spec que as exercita (58a9519, commit sem alteração de arquivos).

### (e) AP6: internos e reexportações

- Continuam exportados, **fora do contrato** e sem `stripInternal`: os itens `@internal` do entry `.` do angular (`RteDialogController`, `RteToolbarState`, `RteFloatingMenusApi`, ...) e as classes-base `RteTextValidator` e `RteCountValidator` (os chunks `@defer` e o rollup do ng-packagr dependem deles; tirá-los do `.d.ts` quebraria a checagem de templates do consumidor, que lê os estáticos `ɵcmp`). O api-extractor já os omite dos relatórios.
- Sem camada `@beta`/`@experimental` na 1.0: o que não puder ser prometido é `@internal` ou não existe.
- Reexportações intencionais, **públicas**: `clearLocalDrafts` no `.` do angular, `RTE_LABELS_EN` no `/i18n` e `RteTocEntry` no `/toc` do render.

### (f) Versões e dependências

`npm ls @cds/rte-core` após instalar os 5 tarballs: uma versão só, vinda do tarball (spike da T1). Saída de `npm run release-plan` (que roda `changeset status`):

```text
@cds/rte-angular: 0.0.0 -> 0.1.0 (minor)
@cds/rte-core: 0.0.0 -> 0.1.0 (minor)
@cds/rte-render: 0.0.0 -> 0.1.0 (minor)
@cds/rte-sanitizer: 0.0.0 -> 0.1.0 (minor)
@cds/rte-theme: 0.0.0 -> 0.1.0 (minor)
```

Nenhum campo `version` foi alterado e `changeset version`/`publish` não rodaram. O `release-plan` falha se o grupo `fixed` ficar incompleto ou se alguma versão planejada for `>= 1.0.0` sem `RTE_ALLOW_1_0=1`.

### (g) Guardas no CI

`release-plan` (todo evento) e `api-diff` (só `pull_request`) em `ci.yml`; o alvo `api` dos 5 pacotes cobre TS e CSS (`UPDATE_API=1` regrava os dois); o `check:rules` reprova nome antigo, dependência interna fora da regra, CSS publicado sem relatório e prontidão inválida.

### (h) Prontidão para a 1.0

`docs/release/prontidao-1.0.md` lista as pré-condições. O agente fechou AP1 a AP14 e os itens automáticos; ficam **abertos**:

- **CI do PR nos 3 motores:** o resultado vem do PR.
- **14 dias corridos sem mudança de quebra nos relatórios depois do congelamento (AP9):** congelamento com o `api-diff` ligado (52177b3, 2026-10-09); data mínima = 14 dias depois do merge da 09c no `main`, nunca antes de 2026-10-23. Não pode ser marcado no dia do merge.
- **Itens do dono (`TODO-AUTOR`):** nome/escopo e titular do `LICENSE` (PB2); conta npm, 2FA e _trusted publishing_ (PB3, PB4); publicação `0.x` e consumidor real (PB12 a PB14); canal e _dist-tag_; teste de 15 minutos (kit `dist/rte-kit-*.zip`, material em `docs/usabilidade/`); execução do roteiro de leitor de tela com a K4 (`docs/quality/roteiro-leitor-de-tela.md`, registro no ADR 0021); medição ociosa do O11; proteção do `main` (comando nos ADRs 0019 e 0021); rodada `full`/`next` (ADR 0019 h); GitHub Pages (`RTE_PAGES`); escopo Pro do `open-core.md`; contato do `CODE_OF_CONDUCT.md`; futuro _schematic_ `ng add` (opcional).

## Consequências

- Toda mudança de API pública, de CSS público ou do esquema exige changeset com o tipo certo (`minor` em `0.x` para remoção/alteração; `major` a partir da `1.0`).
- A 09b encontra dependências, `fixed`, `release-plan` e changesets prontos; PB5, PB6 e PB15 passam a "feito na 09c"; o PR de versão só roda `changeset version` (os 5 em `0.1.0`). A renomeação de escopo (PB2) inclui a lista da AP3 na regra de nomes antigos.
- O primeiro changelog é curto e descreve o estado final.
- A `1.0.0` fica bloqueada pelos itens do dono, visíveis numa lista só.
- Riscos aceitos: o `api-diff` só vê changesets commitados; token do guia que nenhum CSS declara não é detectado; os itens do dono dependem de pessoas, não de código.
