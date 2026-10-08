# Segurança: garantias da biblioteca e deveres do servidor

Escopo: XSS e abuso a partir de conteúdo não confiável (HTML salvo, colado ou exibido) e o envio de arquivos. Reporte falhas conforme o [SECURITY.md](../SECURITY.md). A decisão e as evidências do sanitizador estão no [ADR 0006](decisions/0006-sanitizador.md); o esquema, no [ADR 0003](decisions/0003-esquema-do-html.md); a exibição, no [ADR 0012](decisions/0012-renderizacao.md); o envio e o rascunho, no [ADR 0013](decisions/0013-envio-de-arquivos.md); a mídia, no [ADR 0011](decisions/0011-midia.md).

## Resumo do modelo de ameaças

| Ameaça                | Vetor                                             | Defesa da biblioteca                                                                                                                                    |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XSS via HTML          | Conteúdo salvo, importado ou exibido no site      | `@cds/rte-sanitizer` (lista de permissões do esquema); `validateHtml` e os validadores do Angular; exibição por `@cds/rte-render`                       |
| XSS via colagem       | HTML/Markdown colado no editor                    | O esquema do Tiptap descarta o que não é do esquema; classes e estilos filtrados; links e URLs validados                                                |
| Respostas de servidor | Adaptador de upload devolvendo URL ou HTML hostil | `mapResponse` do consumidor + `readUploadedMedia` validam a mídia; nada da resposta vira HTML sem passar pelo esquema                                   |
| Upload                | Tipo, tamanho e origem do arquivo                 | Limites e tipos no adaptador são conveniência; **o servidor revalida tudo** (seção abaixo)                                                              |
| CSP                   | Estilos e scripts inline                          | Sem `eval`, scripts inline nem `style` inline injetado; o app de teste roda com CSP estrita; embeds exigem `frame-src` do consumidor                    |
| SSR                   | Execução no servidor                              | Sem globais de DOM no código da lib (lint, D25); HTML renderizado sem `<script>`                                                                        |
| Cadeia de suprimentos | Dependência comprometida                          | Única dependência de runtime: `htmlparser2` (só em `@cds/rte-core/html`); `npm audit --omit=dev --audit-level=high` **bloqueia** o CI; gate de licenças |

## O que o servidor DEVE fazer

A biblioteca garante o formato do HTML e a validade das URLs; **não** garante quem pode enviar, o que é gravado nem como a mídia é servida. O `examples/server-node` ([README](../examples/server-node/README.md)) implementa a maior parte e é uma referência, não um produto.

1. **Sanitizar na gravação**, com `createSanitizer(opçõesDoEditor)` e **as mesmas opções** do editor, numa versão maior igual ou mais nova. O sanitizador no navegador é segunda barreira, nunca a única (hipótese 1).
2. **Recusar saída acima do limite que o servidor guarda.** `maxInputLength` vale para a _entrada_; a saída pode ser maior (`&` vira `&amp;`, NBSP vira `&nbsp;`) e re-sanitizar uma saída grande pode lançar `input-too-long`. Compare `sanitize(html).length` com o seu teto antes de gravar.
3. **Autenticar e proteger contra CSRF o envio** (e a gravação). Token CSRF ligado à sessão, cookie `SameSite=Strict` (`__Host-` e `Secure` atrás de https). O `httpUploadAdapter` usa `XMLHttpRequest`: os interceptors do Angular e o cabeçalho XSRF automático **não** valem; envie o cabeçalho por `headers` (o `Content-Type` do multipart não pode ser sobrescrito). CORS por **lista de origens permitidas**, nunca refletindo o `Origin` com credenciais.
4. **Validar o arquivo:** tipo por _magic bytes_ (nunca o MIME ou a extensão do cliente), **sem SVG**, tamanho máximo, **teto de pixels** (por exemplo 40 Mpx, contra bombas de descompressão), limite de envios simultâneos e cota; gerar o nome guardado (o do cliente é só texto); recodificar a imagem elimina payloads em metadados.
5. **Servir a mídia** com `Content-Type` correto, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` e `Content-Security-Policy: default-src 'none'; sandbox`, de preferência de **outro domínio sem cookies**, com `Range` (vídeo no Safari). Todo `GET` deve ser **sem efeito colateral**: mídia relativa ou de qualquer host `https` pode ser pedida por um autor hostil via `<img>` na página de outro leitor.
6. **SSRF no `registerExternal`:** o re-hospedamento de imagens externas faz o _servidor_ buscar uma URL escolhida pelo autor. Valide o esquema (`https`), resolva o DNS e recuse IPs privados, _loopback_, _link-local_ e metadados de nuvem; limite tamanho, tempo e redirecionamentos; aplique o item 4 ao que baixar.
7. **Dono da mídia no `onMediaRemoved`:** a remoção é um _pedido_ do navegador. Confira se a mídia pertence ao texto e ao usuário antes de apagar; apague só depois da carência e só o que nenhum outro texto referencia.
8. **Carência de órfãs ≥ vida do rascunho** (7 dias por padrão, `maxAgeMs`): um rascunho restaurável pode referenciar mídia ainda não gravada.

## Rascunho no navegador

O rascunho (`draftKey`) fica no `localStorage`, em texto claro, **sem escopo por usuário**: quem usa o mesmo navegador e a mesma chave lê o rascunho. Ponha o **id do usuário na chave** (`user-7:doc-42`) e chame `clearLocalDrafts()` no logout. O conteúdo restaurado volta a passar pelo esquema e nunca é restaurado sem a pessoa pedir.

## Mídia e links

- **Mídia é só `https`** (e relativa, por padrão). `http:` passa só em links (`href`), não em `src`/`poster`/`srcset`.
- **Padrão permissivo (decisão consciente):** sem `mediaHosts`, qualquer host `https` é aceito, e `allowRelativeMedia` é `true`. Isso permite rastreamento por imagem (o host vê o leitor) e `GET`s com efeito colateral no próprio site. **Em sites com vários autores configure `mediaHosts` (a lista dos seus hosts de mídia) e `allowRelativeMedia: false`** e alinhe `img-src`/`media-src` da CSP.
- `/\host/x` e `//host/x` são **rejeitados** (relativo só com `/` simples; barra invertida nunca passa).
- `linkPolicy.protocols` e `allowRelative` valem no editor **e no sanitizador** (mesmas opções, mesmo resultado), assim como `blockedDomains` e `forceRel`.
- `caption` de tabela: o sanitizador a aceita, mas o editor ainda a descarta ao reeditar. Reeditar um conteúdo com legenda de tabela a perde; o HTML exibido (sem reeditar) a mantém.

## Exibição (`trusted`)

`[mode]="'trusted'"` dispensa o sanitizador no navegador e vale **só** para HTML que o servidor já sanitizou com `createSanitizer` (mesma versão maior e mesmas opções): as transformações de exibição são varreduras de _tags_ seguras apenas sobre a saída canônica. Detalhes na seção "Exibição" mais abaixo.

## Cadeia de suprimentos

- Dependência de runtime: só `htmlparser2` (e só no entry `@cds/rte-core/html`); `@angular/*`, `@tiptap/*` etc. são peers.
- `npm run audit` (`npm audit --omit=dev --audit-level=high`) roda no job `verify` do CI e **bloqueia**; `npm run check:licenses` confere as licenças; `THIRD-PARTY-NOTICES.md` é gerado.
- Publicação (provenance, assinatura, 2FA do registro) fica para a spec 09b. TODO-AUTOR: definir o registro e a política de publicação.

# Sanitizador: o que protege e o que não protege

Este documento descreve o que o `@cds/rte-sanitizer` protege, o que ele não protege, as hipóteses em que a garantia vale, a CSP recomendada e como reportar vulnerabilidades. A decisão e as evidências estão no [ADR 0006](decisions/0006-sanitizador.md); o contrato, na [spec 04](specs/04-sanitizador.md).

## O que o sanitizador protege

As garantias abaixo valem para o **esquema padrão**. Opções personalizadas (`features`, `linkPolicy`, `mediaHosts`, provedores de embed) mudam o esquema e podem alargar o que passa; quem as muda responde pelo esquema resultante.

- **Execução de script:** nenhum `script`, atributo `on*`, `svg`/`math`, `object`/`embed` nem conteúdo de texto cru na saída.
- **`javascript:`, `data:` e similares:** em `href` só `https`, `http`, `mailto` e `tel` (e relativos e fragmentos); em `src`, `poster` e candidatos de `srcset` (mídia) só `https` (e relativos). Vale também ofuscado por entidades, TAB/LF, maiúsculas, caracteres de controle e `\`.
- **CSS perigoso:** `style` só com as propriedades e valores do esquema; `url(`, `expression`, `\`, comentários, `!important`, `image-set(`, `src(` e `@import` são descartados.
- **`iframe` fora dos provedores:** só os provedores ativos (`src` canônico), sempre vazio e com `sandbox`, `allow` e `referrerpolicy` fixos.
- **_DOM clobbering_:** `name` nunca passa (o esquema não tem esse atributo); `id` só passa com o padrão `rt-…` do esquema (títulos `h2`–`h4`), e um `id` repetido perde o `id`.
- **_Tabnabbing_:** `target="_blank"` recebe `rel` com `noopener noreferrer` (mais o que a política de links exigir).
- **mXSS:** a saída é serializada da árvore do sanitizador, tudo escapado, num subconjunto que se mantém estável sob o parser do navegador (invariante I1). A estabilidade é **verificada por teste** (corpus de XSS, gerador hostil e as regras N1–N7 do ADR 0006, em Chromium, Firefox e WebKit), não provada formalmente. As divergências entre o `htmlparser2` e o navegador na leitura da _entrada_ (por exemplo, a conversão Unicode de maiúsculas em nomes de tag) só fazem o sanitizador descartar ou manter texto; nunca criam marcação na saída.

## O que o sanitizador não protege

- **_Phishing_ por link `https`/`http` válido:** um link bem formado para um site malicioso continua válido (a política `blockedDomains` ajuda, mas não substitui moderação).
- **`http:` sem TLS:** links, imagens e mídia `http:` passam; podem ser alterados no caminho (_man-in-the-middle_) e, numa página `https`, viram conteúdo misto.
- **Rastreamento por imagem de qualquer host** quando `mediaHosts` não está configurado: carregar a imagem revela o leitor ao host. Configure `mediaHosts` (e `allowRelativeMedia: false`) em sites com vários autores. O `src` relativo `/\host/x` (que o navegador leria como `//host/x`) e `//host/x` são rejeitados.
- **Conteúdo dos provedores de embed:** o que o YouTube, o Vimeo ou o Spotify servem dentro do `iframe` não é controlado por nós. O `sandbox` fixo é `allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox`: o provedor **executa scripts** com a origem dele (não a da página hospedeira, porque o `src` é sempre de outra origem) e **pode abrir janelas sem _sandbox_**. O `sandbox` não isola de um provedor comprometido; quem não confia nos provedores desliga `embeds`.
- **_UI redress_ por CSS e layout:** o conteúdo permitido ainda pode imitar a interface da página (textos, links e imagens dispostos como botões ou avisos), esconder texto com cores próximas do fundo (as cores da paleta) e ocupar espaço demais: `img` e `iframe` aceitam `width`/`height` até 10000. A página hospedeira deve limitar o conteúdo (por exemplo `max-width: 100%` e `overflow` no contêiner).
- **Links relativos fora do site:** um `href` relativo vale no domínio onde o HTML for exibido.
- **Opções só do editor:** `linkPolicy.defaultRel` e `target` são do editor; o servidor impõe `blockedDomains`, `forceRel`, `protocols` e `allowRelative` (passe as **mesmas opções** a `createSanitizer`).

## Hipóteses

A garantia vale se, e somente se:

1. **A sanitização que conta é a do servidor, na gravação**, com as **mesmas opções do editor** (`createSanitizer(opçõesDoEditor)`). O sanitizador no navegador (spec 06) é uma segunda barreira, nunca a única. Sanitizar só no cliente dá falsa sensação de segurança.
2. **A saída é inserida como filhos de um elemento de fluxo** (como `div`) **num documento HTML em modo padrão**, e **nunca** dentro de atributo, `script`, `svg` ou `template`.
3. **A profundidade do ponto de inserção mais `maxDepth` fica ≤ 512.** O parser do Chromium achata o DOM acima de 512 elementos abertos e conta todos os ancestrais do ponto de inserção (`html`, `body`, os invólucros da aplicação), também quando a saída é lida como parte do documento inteiro (SSR). Acima disso a invariante I1 quebra: a árvore lida difere da saída (não é XSS, mas a releitura e a hidratação divergem). A API aceita `maxDepth` até 512; o padrão 256 deixa folga.

Fora dessas hipóteses o ADR 0006 não oferece garantia.

## CSP recomendada

A sanitização não substitui a CSP; as duas camadas se somam.

- `script-src` sem `unsafe-inline` e sem `unsafe-eval`; nenhum _handler_ inline é necessário para exibir o conteúdo.
- `frame-src` só com os hosts dos provedores de embed ativos (por exemplo `https://www.youtube-nocookie.com`, `https://player.vimeo.com`, `https://open.spotify.com`).
- `img-src` e `media-src` alinhados a `mediaHosts` (as mesmas origens que o esquema aceita), em vez de `*`.
- `object-src 'none'` e `base-uri 'none'`.
- Quem já sanitiza no servidor e quer evitar o custo do pipe no navegador usa o modo `trusted` da spec 06, junto com Trusted Types, com a CSP acima como defesa em profundidade.

## Exibição (`@cds/rte-render`)

A exibição do HTML publicado (spec 06, [ADR 0012](decisions/0012-renderizacao.md)) é uma **segunda barreira**: a que vale continua sendo a do servidor, na gravação (hipótese 1). O que a diretiva `[rteContent]` faz e o que ela supõe:

- **H4, modo padrão `sanitize`.** O HTML passa pelo sanitizador injetado por `provideRteRender({ sanitize: createSanitizer(opçõesDoEditor) })`, com as **mesmas opções do editor**. Sem sanitizador a diretiva **lança** na criação (no navegador e no servidor; no SSR com o `ErrorHandler` padrão o erro é registrado e o artigo sai vazio, o que também falha fechado). `[mode]="'trusted'"` dispensa o sanitizador e vale **só** para HTML que o servidor já sanitizou com `createSanitizer` (mesma versão maior): a pré-condição é **de segurança**: as transformações de exibição (H6) supõem a forma canônica da saída (S13), e fora dela (por exemplo `<` cru no valor de um atributo, como deixam serializadores de outros sanitizadores) a varredura pode fechar um atributo e criar marcação, isto é, **executar** script (`<img alt="<table><img src=x onerror=…>">` vira dois elementos). `trusted` só para a saída de `createSanitizer`. `RteSanitizeError` (`input-too-long`, `max-depth`) dá conteúdo vazio, `console.warn` e `error()`.
- **H8, estilos por CSSOM.** Sob uma CSP sem `'unsafe-inline'` o atributo `style` vindo do HTML é bloqueado, mas a escrita por CSSOM não. A diretiva reaplica o `style` de cada elemento do conteúdo depois da inserção, **só com as propriedades da lista** `RTE_STYLE_PROPERTIES` do core (`text-align` de `p`/`h2`–`h4`, `width` de `col`, `aspect-ratio` de `iframe`, `color` de `span`, `background-color` de `mark`; Ruling 23), **nos dois modos**: o resto da declaração (inclusive `position`, `background-image`, qualquer `!important`, e o `style` inteiro se tiver `` ou comentário) é descartado, então a escrita por CSSOM não reabilita CSS que a CSP barrou; em `trusted` o CSS fora da lista é retirado também no navegador sem CSP. É a mesma informação que o esquema já validou, e a CSP continua sem `'unsafe-inline'`. Efeito esperado na CSP: um relatório `style-src-attr` por elemento com `style` na inserção (e outro na hidratação, que re-atribui o `innerHTML`); nenhuma violação de `script-src*`. A tabela com larguras de coluna recebe também `width`/`min-width` por CSSOM, **calculados** a partir dos `col` (a única escrita fora da lista, em px inteiros, depois da restauração; um `style` da própria `table` é zerado). Sem JS, o conteúdo aparece com a paleta e sem alinhamento, larguras de coluna e proporção de _embed_.
- **H9, _Trusted Types_.** O HTML entra no DOM por uma única porta, a ligação de `innerHTML` do _host_ com `DomSanitizer.bypassSecurityTrustHtml` (política `angular#unsafe-bypass` do Angular), no único arquivo `src/content/rte-content.ts`. Nenhum `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` nem outro `bypassSecurityTrust*` no pacote (lint e `lint-guards.spec.ts`). Cabeçalho aceito: `Content-Security-Policy: require-trusted-types-for 'script'; trusted-types angular angular#unsafe-bypass`. Medido nos três motores (Chromium, Firefox e WebKit aplicam _Trusted Types_): 0 violações na rota de teste.
- **H6, transformações.** O rolador de tabela e a reescrita de `href="#x"` são varreduras de _tags_ sobre o HTML canônico; a propriedade da R4 (gerador hostil e `editor-corpus`) confere que nada fora de `table` e de `a[href^="#"]` muda. A base do fragmento é escapada por `escapeHtmlAttribute` e o `pathname` sai com uma só barra inicial (`//outro.host/x` viraria link protocolo-relativo para outro _host_). Mudar a H6 ou a H8 é mudança que afeta a segurança e exige changeset que a descreva.
- **Evidência.** Corpus de XSS do sanitizador (290 casos) e 2000 casos do gerador hostil exibidos pela diretiva: nenhum `<script>`, `on*`, `javascript:`/`data:` nem `srcdoc` no DOM, nenhuma violação `script-src*` (com controle positivo), nos três motores e nos dois _builds_ do app de teste.
- **Profundidade (hipótese 3).** Manter `maxDepth` no padrão (256) e o conteúdo a menos de ~250 níveis da raiz do documento.

## Como reportar

Reporte vulnerabilidades de forma **privada**, sem abrir _issue_ pública, pelo canal privado do GitHub (aba **Security** do repositório, **Report a vulnerability**). Não há canal por e-mail. Prazos e versões suportadas: [SECURITY.md](../SECURITY.md).

Mudanças no esquema, em `sanitizeStyle`, `serializeTokens` ou nos interpretadores afetam a segurança e exigem um `changeset` que as descreva.
