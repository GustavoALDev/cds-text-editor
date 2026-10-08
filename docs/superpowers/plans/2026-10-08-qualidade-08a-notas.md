# Notas da 08a (T3): rastreabilidade (X7), N47 e J8 (X8)

Insumo para o ADR 0019 (T6). "3 motores" = Chromium, Firefox e WebKit no CI; o local foi verificado nos três (Windows).

## Tabela de rastreabilidade: fluxos da spec 08 ("Camadas → E2E") → testes

| Fluxo | Testes (arquivo, id) | Motores | Lacuna |
| --- | --- | --- | --- |
| Digitar | `e2e/angular/editor-history.spec.ts` N48; `editor-draft.spec.ts` N39 (digitar, recarregar); `e2e/core/editor-paste.spec.ts` E2 | 3 | N48 (nova) |
| Formatar | `editor-toolbar-commands.spec.ts` N11 (comandos pela interface, atalhos de negrito/citação/tarefas); `editor-toolbar-keyboard.spec.ts` N9; N48 (`Mod+B`) | 3 | nenhuma |
| Colar print | `editor-upload-paste-drop.spec.ts` N35 / E12 ("print colado (só arquivo)", "texto + imagem", "três arquivos"); `editor-paste-external.spec.ts` N41 | 3 | nenhuma |
| Arrastar imagem | `editor-upload-paste-drop.spec.ts` N35 / E13 (soltar no 2º parágrafo, arrastar imagem existente move o nó) | 3 | nenhuma |
| Redimensionar pelos 4 cantos | `e2e/core/editor-resize.spec.ts` E3 (`nw`, `ne`, `sw`, `se`, limite mínimo, Escape) | 3 | nenhuma |
| Menu `/` | `e2e/core/editor-slash.spec.ts` E11; `e2e/angular/editor-slash.spec.ts` N42 | 3 | nenhuma |
| `Ctrl+F` | `e2e/core/editor-search.spec.ts` E10; `e2e/angular/editor-search.spec.ts` N43; `editor-search-readonly.spec.ts` N47 (nova) | 3 | N47 (nova) |
| Modal de link com `rel` | `editor-dialogs-link.spec.ts` N16 (`Ctrl+K`, `target="_blank" rel="noopener noreferrer"`) | 3 | nenhuma |
| Upload com progresso e cancelamento | `editor-upload-states.spec.ts` N36 (progresso, fila, cancelar pelo teclado, erros); `editor-upload-dialog.spec.ts` N34; `apps/demo/e2e/j5-upload.spec.ts` J5; `apps/demo/e2e/j8-server.spec.ts` J8 (e) | 3 (J5 com servidor: só Chromium) | nenhuma |
| Rascunho + `beforeunload` | `editor-draft.spec.ts` N39; `editor-draft-save.spec.ts` N40 ("beforeunload só aparece sujo") | 3 | nenhuma |
| Vimeo/Spotify | `editor-media-video-embed.spec.ts` N28 (YouTube, Vimeo, Spotify, recusa de outro endereço); `e2e/core/embeds.spec.ts` | 3 | nenhuma |
| Tabela | `e2e/core/editor-keyboard.spec.ts` (Tab nas células); `e2e/core/editor-slash.spec.ts` E11 (`/tab`); `editor-toolbar-commands.spec.ts` N11 (R8 guarda de tabela) | 3 | nenhuma |
| Desfazer/refazer | `Mod+Z`: N16, N28, N41, E11; refazer: `editor-media-session.spec.ts` N27/N29 (`Mod+Shift+Z`), `editor-toolbar-keyboard.spec.ts` N9 (botão Redo), N48 (`Mod+Shift+Z` e `Ctrl+Y` no texto) | 3 | N48 (texto puro, nova) |
| Teclado virtual (emulação mobile) | fora da T3 | | 08b |

## N47 e N48

- N47 (`e2e/angular/editor-search-readonly.spec.ts`): editor `signal` de `/forms` em `readonly`; `Mod+F` abre a busca com a seleção, `Enter`/`Shift+Enter` navegam (`1 of 3` ↔ `2 of 3`), sem botão que expande a substituição, sem campo de substituir e sem "Replace"; `Escape` fecha. Arquivo novo (não mexe em `editor-search.spec.ts`, que a T2 envolve na marca `@compat`).
- N48 (`e2e/angular/editor-history.spec.ts`): digitar + `Mod+B`, desfazer em passos até o texto sumir, `Mod+Shift+Z` até voltar; `Ctrl+Y` (fora do macOS).

## J8 (`apps/demo/e2e/j8-server.spec.ts`)

Servidor `--with-server` (base + 2), pasta temporária, `beforeEach` abre `/files` em modo `server`. Só status são afirmados; o bearer da execução vem do `demo-config.json` (a própria página o usa). "Nada gravado" é conferido por rótulo único anexado ao final dos bytes (procurado em todas as pastas `cds-rte-demo-media-*`), robusto contra o J5 em paralelo.

- (a) 201; `Authorization: Bearer` e `X-CSRF-Token` presentes na requisição; `GET /media/<nome>` com `nosniff` e `default-src 'none'; sandbox`; bytes idênticos; arquivo na pasta.
- (b) `page.route` + `route.continue({ headers })` sem `X-CSRF-Token` → 403, `files-status` com "Falha ao enviar …" (`aria-live=polite`), nada gravado.
- (c) SVG com nome `.png` → 415, erro, nada gravado.
- (d) O cliente recusa acima de 10 MiB antes de enviar (mesmo teto do servidor), então o corpo é trocado na rede (`route.continue({ postData })`) por um multipart de 11 MiB → 413, erro, nada gravado.
- (e) requisição retida em `page.route`; cancelar pela bandeja → item some, nenhuma imagem, nada gravado.
- (f) WebM → 201, `<video>` com `readyState >= 1`.

Resultado local: Chromium e Firefox 6/6. WebKit 6/6, com a anotação `webkit-sem-range` no (f): sem a anotação o (f) falhava, pois o `readyState` do WebKit ficava em 0 porque o `GET /media` do servidor de exemplo não responde a `Range` com 206 (o WebKit exige; `canPlayType` diz "probably"). Divergência de motor com causa no servidor, não no editor nem no demo. O teste a anota (`webkit-sem-range`), confere `Content-Type: video/webm` e **volta à verificação estrita sozinho** quando `Range` → 206 passar a funcionar.

## O que muda quando a correção de segurança do `examples/server-node` entrar (outro branch)

- `AUTH_TOKEN` obrigatório e CSRF ligado à sessão: o J8 usa o token por execução do `serve.mjs --with-server` e o cookie/token que a página busca em `/csrf`; se `serve.mjs` passar a gerar a sessão de outro modo (ex.: `GET /csrf` exigir o bearer), `files.page.ts` precisa mandar o bearer em `/csrf`. (b) remove só o cabeçalho; continua válido. Se o 403 passar a vir por sessão inválida em vez de token ausente, o status é o mesmo.
- `Range`: o (f) no WebKit passa a ser estrito (ver acima); ajustar a asserção de `Content-Security-Policy` do `/media` se o `Range` mudar cabeçalhos (206 também deve levá-los).
- Teto de pixels: o PNG de `exemplo.png` é pequeno; nenhuma mudança esperada. Um PNG acima do teto seria um (g) novo.
- O (d) assume teto de 10 MiB (`maxBytes`): ajustar o tamanho do corpo trocado se o padrão mudar.
- O mesmo vale para a regra de que SVG vira 415 (`unsupported_type`): só o status é afirmado.
