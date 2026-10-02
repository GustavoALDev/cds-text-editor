# Plano: editor de texto rico como produto (lib independente)

> **Para quem é este documento:** instrução de construção de um **projeto novo e independente** (greenfield, já em **Angular 22+**): uma **biblioteca comercial open source (MIT)** de editor de texto rico para Angular. O editor do projeto *MyPresentation* é usado **apenas como referência** (é o "modelo"): serve para sabermos o que construir, o que reaproveitar como ideia ou código e o que evitar. **O modelo não será migrado nem atualizado para Angular 22**; o código dele é copiado/adaptado para o projeto novo quando útil. Este documento é autocontido: lista o que o modelo já tem, o que **não** tem, o que é preciso criar, em que ordem e como validar.
>
> **Status:** planejamento (rascunho 1). Nada aqui foi implementado ainda. Os itens marcados **[DECIDIR]** precisam de uma decisão antes da fase indicada.

## 0. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Licença | **MIT**, publicado no npm público. Monetização por suporte/serviços ou módulo Pro futuro (fora do escopo da v1) |
| Framework | **Somente Angular 22+**, em projeto novo (o modelo, em 21.2, é só referência e não será atualizado). O núcleo (extensões, utilitários, esquema) nasce **sem Angular**, deixando a porta aberta para outros frameworks |
| Estilos e tema | **CSS próprio com variáveis `--rte-*`**, sem Tailwind, sem Sass e **sem build de tema**. **Tema de 3 cores** (`primary`, `secondary`, `tertiary`) com padrão nas cores do Angular; todo o resto é **derivado automaticamente** (hover, fundos suaves, texto legível, foco, modo escuro). Personalização bem mais simples que a do Angular Material (seção 7). **Decididos:** 3ª cor = `tertiary`; neutros tingidos pela `primary`; modo `auto`; cores semânticas fixas (ajustáveis só no nível avançado) |
| Pacotes da v1 | **Editor + sanitizador + renderização** (ciclo completo: editar → sanitizar no servidor → exibir no site) |
| Base técnica | Tiptap 3 (MIT) sobre ProseMirror (MIT). **Nada** das extensões Pro/Cloud da Tiptap |
| **Stack Angular 22** | A lib é **nativa do Angular 22**: **Signal Forms** como integração principal de formulários (`FormValueControl` / `[formField]`), API toda em **signals**, **zoneless + OnPush**, **Angular Aria** para acessibilidade e `@defer` para carregar sob demanda. **Foco em desempenho** e em acoplamento profundo com a versão (seção 6) |

## 1. Objetivo e princípios

**Objetivo:** um editor de texto rico, bom para **sites de notícia e conteúdo editorial**, que um time instale com `npm i`, configure em minutos e use em produção com segurança.

**Princípios (ordem de prioridade quando houver conflito):**
1. **Seguro por padrão.** HTML que sai do editor passa por allowlist; a exibição nunca confia cegamente no conteúdo.
2. **Autocontido.** Zero dependência de Tailwind, de design system, de back-end ou de interceptors da aplicação host.
3. **Acessível** (WCAG 2.2 AA) e **internacionalizável** desde a v1.
4. **Configurável sem fork:** recursos ligáveis/desligáveis, toolbar configurável, provedores de embed e upload plugáveis.
5. **Leve:** recursos pesados (realce de código, linguagens) carregados sob demanda.
6. **Previsível:** API pública pequena, versionada (semver), com testes de contrato.
7. **Nativo do Angular 22 e rápido:** usar as APIs estáveis da versão (Signal Forms, signals, zoneless, Aria, `@defer`) em vez de reinventá-las, com **orçamentos de desempenho medidos em CI** (seção 6).

**Fora de escopo da v1:** colaboração em tempo real, comentários, controle de versões de documento, IA, importação/exportação de DOCX/PDF, Markdown bidirecional, outros frameworks (React/Vue).

## 2. O que o modelo já tem (inventário)

Origem: `libs/forms/src/lib/components/rich-text-editor` (≈ 39 arquivos, ≈ 4,2 mil linhas sem specs, 10 arquivos de teste) + sanitizador em `apps/back-end/src/common/sanitize` + renderização em `libs/ui/src/lib/rich-html`.

### 2.1 Recursos do editor
- **Texto:** negrito, itálico, sublinhado, tachado, código inline, sobrescrito/subscrito, cor do texto, marca-texto multicolor, alinhamento, limpar formatação.
- **Estrutura:** títulos H2–H4 (H1 reservado ao título da matéria; H1 legado vira H2) com **`id` automático** para âncoras; listas, lista de tarefas, citação, divisor, bloco de código com realce, tabelas (menu de grade, mesclar/dividir).
- **Blocos de notícia:** citação em destaque com autor, caixa de destaque (4 variantes), "Leia também", marca de idioma (`lang`).
- **Mídia:** imagem em `<figure>` com legenda, crédito, alinhamento (esq./centro/dir./largura total), `alt` obrigatório (ou "decorativa"), `width`/`height`, `loading="lazy"`, `srcset`/`sizes`, **redimensionamento pelos 4 cantos**, colar/arrastar imagem com upload; vídeo enviado; YouTube; Vimeo; Spotify.
- **Links:** validação de protocolo (`http`, `https`, `mailto`, `tel`), normalização (`site.com` → `https://site.com`), `target`, `rel` (nofollow/sponsored/ugc + noopener/noreferrer), inserir link sem seleção.
- **Produtividade:** menu `/` (14 blocos), buscar e substituir (Ctrl+F), contagem de palavras/caracteres e tempo de leitura, limite de caracteres dinâmico, rascunho local com restauração e aviso ao sair (`beforeunload`), editar HTML bruto, bubble menu de texto e de imagem.
- **Integração Angular:** `ControlValueAccessor` (reactive forms e `ngModel`), `readonly`, `placeholder`, `minHeight`/`maxHeight`, eventos de blur/focus.

### 2.2 Sanitizador (hoje no back-end Nest)
`sanitizeRichText` (sanitize-html): allowlist de tags, atributos, estilos (`color`, `background-color`, `text-align`), classes (`rt-*`, `hljs-*`), esquemas de URL, hosts de iframe (YouTube, Vimeo, Spotify), `rel`/`lang`/`id` validados, remoção de mídia que perdeu o `src`; `htmlToText`, `countWords`, `calculateReadingTime`.

### 2.3 Renderização (hoje em `libs/ui`)
`RichHtmlPipe` (confia no HTML), `rich-content.scss` (figuras, blocos, tabelas com scroll, âncoras), `extractToc` + `ui-rich-toc` (sumário).

### 2.4 Qualidade já existente
- **Testes (2026-10-02):** 134 do editor (Vitest + Tiptap real em jsdom, incluindo componentes e modais), 80 do back-end, 8 de `ui`, **14 E2E Playwright em navegador real** (`apps/control-panel-e2e`, API simulada no navegador) e 13 E2E do back-end contra servidor + MySQL reais (inclui limpeza de órfãs).
- **Verificação em navegador real:** feita em Chromium 153; achou 5 bugs que o jsdom não via (menus flutuantes sempre visíveis, colar imagem em parágrafo vazio, `<p><img></p>` legado, erro de tipo que o Vitest não pega, altura do editor). Firefox e WebKit ainda não.
- **Teste de contrato editor ↔ sanitizador:** o editor gera um HTML com todos os recursos e o sanitizador não pode descartar nada. Já pegou 2 bugs reais.
- **Bundle:** o editor é entry point separado e carregado sob demanda (chunk ≈ 744 kB brutos, ≈ 186 kB transferidos, dominado por Tiptap/ProseMirror e `highlight.js`).
- **Fixes de armadilhas** documentados na seção 13.
- **Limpeza de uploads órfãos** (back-end do modelo, implementada e testada em E2E): referência para o `examples/server-node` (seção 5.4).

## 3. O que **não** tem e precisa (análise de lacunas)

Legenda de esforço: **P** (horas), **M** (dias), **G** (semana+).

### 3.1 Empacotamento e distribuição
| Lacuna | O que fazer | Esf. |
|---|---|---|
| Sem build de biblioteca | `ng-packagr` (Angular) e `tsup`/`tsc` (sanitizador, núcleo); formatos ESM + tipos | M |
| Sem `package.json` próprio | `name`, `version`, `exports` por entry point, `peerDependencies`, `sideEffects`, `files`, `keywords`, `repository`, `bugs`, `homepage` | P |
| Sem `LICENSE`/`NOTICE` | `LICENSE` (MIT) + `THIRD-PARTY-NOTICES` gerado de `node_modules`. **Verificado em 2026-10-02 no modelo:** dos 65 pacotes do ecossistema do editor, 63 são MIT, 1 BSD-3-Clause (`highlight.js`) e 1 ISC (`lucide-angular`); **nenhum** `@tiptap-pro/*` ou `@tiptap-cloud/*` instalado e nenhuma dependência direta com licença fora de MIT/ISC/BSD/Apache. Uso comercial permitido; manter os avisos de licença. Repetir a verificação no projeto novo (CI com `license-checker`) | P |
| Sem política de versão | semver, `0.x` até estabilizar, changelog (Changesets), tag `next` para pré-lançamentos | P |
| Sem publicação segura | `npm publish --provenance`, 2FA obrigatório na organização, token de automação restrito | P |
| Sem validação de pacote | `publint`, `@arethetypeswrong/cli` (attw), teste de **instalação num app Angular 22 limpo** a cada release | M |

### 3.2 Acoplamento ao projeto de origem (o que **precisa ser cortado**)
| Acoplamento atual | Problema | Solução |
|---|---|---|
| Classes **Tailwind** com tokens do tema (`bg-bg-surface`, `text-text-primary`, `border-input-border`, `bg-brand-violet`…) nos templates | Sem o mesmo Tailwind/tema o editor fica sem estilo | **Reescrever tudo em CSS próprio** com `--rte-*` (seção 7) |
| Variáveis `oklch(var(--bg-surface))`, `--angular-violet`, `--border-color` no SCSS | Idem | Mapear para `--rte-*` com valores padrão |
| Componentes irmãos do design system (`base-input`, `checkbox`, `button`, `radio-group`, `checkbox-group`, diretiva de ícones) | Dependem do tema do projeto | **Substituir por controles internos** simples e acessíveis (ou internalizar com estilo próprio) |
| `EditorMediaService` com URLs fixas (`/media/upload`, `/media/external`) e formato de resposta do back-end de origem; depende de interceptors da aplicação | Impossível usar com outro servidor | **Adaptador de upload injetável** (seção 5.3) |
| Sanitização dentro do back-end Nest | O consumidor ficaria com HTML sem sanitizar | **Pacote `sanitizer` isomórfico** (seção 4) |
| Pipe/estilos de exibição em `libs/ui` | Sem eles o conteúdo não aparece formatado | **Pacote `render`** (seção 4) |
| Textos fixos em **português** (≈ 120 atributos `title`/`label`/`placeholder`/`aria-label` + textos soltos em TS e templates) | Não internacionalizável | **i18n por token** com pt-BR, en e es (seção 5.5) |
| `lucide-angular` como dependência de ícones | Dependência extra, peso | Ícones **SVG internos** (conjunto fechado, ~45 ícones) ou manter peer opcional **[DECIDIR]** |
| `@angular/cdk` (Overlay) usado na toolbar | Dependência pesada para pouco uso | Avaliar `popover`/CSS anchor ou posicionamento próprio; se mantiver, declarar como peer **[DECIDIR]** |

### 3.3 Arquitetura e API pública
| Lacuna | O que fazer | Esf. |
|---|---|---|
| Toolbar fixa | **Toolbar configurável** (grupos/itens, ordem, ocultar) e presets (`minimal`, `article`, `full`) | M |
| Recursos não desligáveis | **Feature flags** por recurso (tabelas, código, embeds, tarefas, mídia…) refletindo na toolbar, no menu `/` e nas extensões | M |
| Embeds fixos (Vimeo/Spotify no código) | **Registro de provedores** (`EmbedProvider`): `match(url)`, `toEmbed(url)`, host permitido; o sanitizador deriva a allowlist dos provedores ativos | M |
| Sem tipos/contratos públicos estáveis | API pública explícita em `index.ts`; **api-extractor** para barrar quebras acidentais | M |
| Saída só em HTML | Opção `format: 'html' \| 'json'` (`getJSON()` do Tiptap) para quem quer armazenar JSON | M |
| Extensões não extensíveis | Aceitar `extensions` adicionais do consumidor e `onEditorReady(editor)` | P |
| Rascunho preso ao `localStorage` | `DraftStorage` injetável (padrão: localStorage com fallback seguro) | P |
| Link policy fixa | Política configurável (protocolos, `rel` padrão, domínios bloqueados, `target` padrão) | P |

### 3.4 Qualidade, acessibilidade e SSR
| Lacuna | O que fazer | Esf. |
|---|---|---|
| O modelo foi verificado só em **Chromium** (14 E2E Playwright); **Firefox/WebKit**, acessibilidade (axe), regressão visual e desempenho nunca foram medidos | Ampliar para **3 engines**, axe, screenshots e orçamentos de desempenho (seção 9); manter a regra "nenhum recurso é feito sem E2E em navegador real" | G |
| Sem auditoria de acessibilidade | Meta **WCAG 2.2 AA**: toolbar como `role="toolbar"` com *roving tabindex*, foco visível, *focus trap* nos modais, anúncios (`aria-live`) para busca/limites, rótulos no `contenteditable` (`role="textbox"`, `aria-multiline`), atalhos documentados, contraste, `prefers-reduced-motion`; testes com **axe** | G |
| Sem teste de SSR | O componente só cria o `Editor` no navegador (`afterNextRender`/`isPlatformBrowser`); remover `document.getElementById`/`window.Image` de caminhos de servidor; **app Angular SSR** de fumaça no CI | M |
| Sem teste visual | Regressão visual (screenshots Playwright) para toolbar, modais, figuras e blocos, em claro/escuro | M |
| Sem orçamento de tamanho | `size-limit` por entry point; **linguagens do `highlight.js` sob demanda** (hoje entra `lowlight/common` inteiro, ≈ 330 kB) | M |
| Sem teste de compatibilidade | Matriz CI: **Angular 22.x** (min e latest) × Tiptap 3.x (min e latest) **[DECIDIR faixa]** | M |
| Suporte a mobile/toque | Alças de redimensionamento já usam `pointer events`; falta validar teclado virtual, seleção por toque e menus em telas estreitas | M |

### 3.5 Documentação, exemplos e comunidade
| Lacuna | O que fazer | Esf. |
|---|---|---|
| Sem README/guia | Início rápido (5 min), instalação, configuração, tema, i18n, upload, segurança, SSR, migração | M |
| Sem referência de API | Gerada dos tipos (TypeDoc/Compodoc) | P |
| Sem demo | **App de demonstração** (Angular) com playground de configuração e temas | M |
| Sem servidor de referência | Exemplo mínimo (Node/Express e Nest) de **upload + sanitização**, para o consumidor copiar | M |
| Sem governança | `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY.md` (como reportar vulnerabilidade), templates de issue/PR, política de suporte e de depreciação | P |
| Marca | Aviso "não afiliado à Tiptap/ProseMirror"; nome do pacote **sem sugerir que é oficial** | P |

### 3.6 Aderência às tecnologias do Angular 22 (estado do modelo × necessário)

Medido no editor do modelo (sem specs): **28** `@Input()` e **20** `@Output()` (decorators), **0** `input()`/`output()`/`model()`, **0** `signal`/`computed`/`effect`/`afterNextRender`, **20** chamadas a `ChangeDetectorRef.detectChanges()` (+ 3 `markForCheck`), **0** `ChangeDetectionStrategy` explícito, 6 componentes com `ngOnChanges`, 6 usos de `takeUntil`, 2 `@HostListener`, 4 modais com **Reactive Forms** (`FormGroup`) e 1 `ngModel`; integração de formulário apenas por `ControlValueAccessor` e dependência do `ngx-tiptap`.

| Modelo (Angular 21, estilo anterior) | Necessário no projeto novo (Angular 22) | Esf. |
|---|---|---|
| Integração só via `ControlValueAccessor` | **`FormValueControl<string>` + `[formField]` (Signal Forms)** como caminho principal; CVA só como compatibilidade para quem usa Reactive/Template Forms | M |
| `@Input()`/`@Output()` com `EventEmitter` | `input()`, `input.required()`, `model()`, `output()`, `viewChild()` | M |
| `detectChanges()` espalhado e `requestAnimationFrame` para atualizar a toolbar; `Promise.resolve().then(markForCheck)` | **Estado do editor em signals** + `computed` memoizados; zero chamadas manuais de detecção de mudanças (seção 6.4) | M |
| Sem `ChangeDetectionStrategy`; nunca testado sem zone.js | **OnPush** (padrão no 22, declarado explicitamente) e **zoneless**; testes nas duas configurações | M |
| Modais com Reactive Forms/`ngModel` | Formulários internos com **Signal Forms** (`form()` + schema): URL segura, `alt` obrigatório, largura mínima, código de idioma | M |
| Acessibilidade escrita à mão (toolbar, menu `/`) | **Angular Aria** (`toolbar`, `menu`, `listbox`, `combobox`) com os harnesses nos testes | M–G |
| Modais e menus carregados junto com o editor | **`@defer`** (modais, busca, menu `/`, detalhes da imagem, HTML bruto) e extensões pesadas por import dinâmico | M |
| `ngx-tiptap` (diretiva da era dos decorators/zone) | Wrapper fino próprio: `afterNextRender` para criar, `DestroyRef` para destruir, signals para estado; **decisão pendente** (seção 12) | M |
| `Subject` + `takeUntil`, `@HostListener` | `takeUntilDestroyed`/`DestroyRef`, `host: {}` no componente | P |
| Serialização do HTML a cada tecla (`getHTML()` em todo `onUpdate`) | Estratégia de atualização (`updateOn`), serialização com debounce e *flush* em blur/submit (seção 6.5) | M |

## 4. Arquitetura proposta (monorepo)

Ferramenta sugerida: **Nx** (já familiar ao time) ou npm workspaces, com `ng-packagr` para Angular. Escopo npm e nome comercial **[DECIDIR]**; abaixo `@escopo/rte-*` é placeholder.

```
rte/
├─ packages/
│  ├─ core/            @escopo/rte-core        (sem Angular) extensões Tiptap, utilitários, ESQUEMA do HTML
│  ├─ sanitizer/       @escopo/rte-sanitizer   (sem Angular; Node e navegador) allowlist derivada do esquema
│  ├─ angular/         @escopo/rte-angular     componentes, serviços, tokens, estilos do editor
│  └─ render/          @escopo/rte-render      pipe, estilos de exibição, sumário (Angular)
├─ apps/
│  ├─ demo/            app Angular de demonstração + playground
│  └─ ssr-smoke/       app Angular SSR mínimo para o CI
├─ examples/
│  └─ server-node/     upload + sanitização de referência (Express) [+ exemplo Nest]
├─ docs/               site de documentação
└─ tools/              scripts (notices, fixtures de contrato)
```

**Grafo de dependências (sem ciclos):**
`core` ← `sanitizer` (usa o esquema) · `core` ← `angular` · `sanitizer` ← `render` (modo `sanitize`, opcional) · `core` ← `render` (TOC/estilos).

### 4.1 `@escopo/rte-core` — fonte única da verdade
- **Extensões Tiptap** (todas as de `extensions/` do modelo: `NewsImage` com NodeView de redimensionamento, `HeadingWithId`, `NewsBlockquote`, `Callout`, `ReadAlso`, `Lang`, `Embed`, `VideoUpload`, `SearchReplace`, `SlashCommand`, `CharLimit`) + a fábrica `createEditorExtensions(options)`.
- **Utilitários puros:** `normalizeHref`, slug/ids de título, tempo de leitura, embeds (`toEmbed`), redimensionamento (`computeResize`), sniff de rascunho, TOC.
- **ESQUEMA DO HTML (novo):** um objeto de dados descrevendo tags, atributos, classes, estilos, esquemas de URL e hosts permitidos **por recurso**. É daqui que sairão: (a) a allowlist do sanitizador, (b) a documentação do HTML gerado, (c) os testes de contrato. **Elimina a duplicação manual** que no modelo era só um comentário pedindo sincronia.

### 4.2 `@escopo/rte-sanitizer`
- `sanitizeRichText(html, options?)` com opções: provedores de embed extras, hosts de mídia permitidos, estilos extras, tamanho máximo de entrada, profundidade máxima.
- `htmlToText`, `countWords`, `readingTime`.
- Funciona em Node e no navegador. **[DECIDIR]** engine: `sanitize-html` (usado no modelo; pesado no navegador, ~100 kB+) × `DOMPurify` (precisa de DOM; no servidor exige jsdom) — **medir** e escolher; possível usar engines diferentes por ambiente atrás da mesma API.
- Adaptadores opcionais de exemplo: middleware Express/Nest.

### 4.3 `@escopo/rte-angular`
Entry points: `/` (componente `RteEditor`, `provideRichText…`), `/styles` (CSS), `/i18n` (pt-BR, en, es), `/testing`. Detalhes na seção 5.

### 4.4 `@escopo/rte-render`
- `RteHtmlPipe` / diretiva `[rteHtml]`: **por padrão sanitiza** (`mode: 'sanitize'`); `mode: 'trusted'` documentado como "só se o servidor já sanitiza" **[DECIDIR padrão com benchmark de tamanho]**.
- `RteTocComponent` + `extractToc` (somente string, funciona em SSR).
- `rte-content.css`: figuras (alinhamento, legenda/crédito), blocos de notícia, tabelas com scroll, âncoras com `scroll-margin`, `iframe`/`video` responsivos, temas claro/escuro, **variáveis `--rte-*`**.
- Utilitário `injectRteHeadMeta` opcional (descrição/tempo de leitura) **[DECIDIR se entra]**.

## 5. Design da API do editor (Angular)

### 5.1 Uso mínimo
```ts
// app.config.ts
provideRichText({ locale: 'pt-BR', upload: httpUploadAdapter({ endpoint: '/api/media/upload' }) })
```
```ts
// Signal Forms (caminho principal)
protected readonly article = signal({ title: '', body: '' });
protected readonly form = form(this.article, (path) => {
  required(path.body);
  maxLength(path.body, 5000);            // vira o limite de caracteres do editor
  rteImagesHaveAlt(path.body);           // validador da lib (seção 6.3)
});
```
```html
<rte-editor [formField]="form.body" ariaLabel="Texto da matéria" />
```
Compatibilidade (quem ainda usa Reactive Forms): `<rte-editor formControlName="content" />` (via `ControlValueAccessor`). Uso sem formulário: `<rte-editor [(value)]="html" />`.

### 5.2 Entradas e saídas (`rte-editor`, API 100% signals)
- **Contrato de controle de formulário** (preenchido pelo Signal Forms): `value` (`model`), `touched`/`touch`, `disabled`, `readonly`, `hidden`, `invalid`, `errors`, `pending`, `required`, `maxLength`, `name`. Detalhes e regras na seção 6.2.
- **Configuração:** `placeholder`, `minHeight`/`maxHeight`, `showWordCount`/`showCharCount`, `toolbar` (preset ou configuração), `features` (liga/desliga), `draftKey`, `format` (`html`|`json`), `updateOn`, `extensions`, `labels`, `ariaLabel`.
- **Saídas:** `contentChange`, `editorReady`, `editorFocus`, `editorBlur`, `uploadError`, `mediaChange` (URLs adicionadas/removidas).
- **Estado reativo exposto (signals somente leitura):** `isEmpty`, `wordCount`, `charCount`, `readingTime`, `isDirty`, `editor` (instância do Tiptap). Métodos: `markSaved()`, `focus()`, `getValue()` (força o *flush* da serialização).

### 5.3 Adaptador de upload (resolve o maior acoplamento)
```ts
interface RteUploadAdapter {
  uploadImage(file: File, ctx: { signal: AbortSignal; onProgress(p: number): void }): Promise<RteUploadedImage>;
  uploadVideo?(file: File, ctx: …): Promise<RteUploadedVideo>;
  registerExternal?(url: string, type: 'image' | 'video'): Promise<{ url: string }>;
  /** Chamado quando a mídia sai do editor — o host decide se remove do servidor (ver 5.4) */
  onMediaRemoved?(url: string): void;
}
interface RteUploadedImage { url: string; width?: number; height?: number; srcset?: string; sizes?: string }
```
Fornecer `httpUploadAdapter({ endpoint, fieldName, headers, withCredentials, mapResponse })` pronto para o caso comum; tudo o mais é do consumidor. **Cancelamento real** (`AbortSignal`) em vez de só descartar a resposta.

### 5.4 Ciclo de vida da mídia (lição aprendida)
No modelo, mídia enviada e depois removida do editor vira **lixo no servidor**. A lib deve: (a) expor `onMediaRemoved`/evento com a lista de URLs **adicionadas e removidas na sessão**; (b) documentar a estratégia recomendada de **limpeza de órfãs no servidor** com carência (o modelo tem uma implementação de referência em NestJS: varredura de todas as colunas de texto, carência medida no relógio do banco, `dryRun`, limite por execução) e incluí-la em `examples/server-node`.

### 5.5 Internacionalização
Token `RTE_LABELS` com um objeto tipado de **todas** as strings (toolbar, modais, menu `/`, erros, aria-labels). Pacotes `pt-BR`, `en`, `es` na v1; fallback para `en`; checagem automática (teste) de que nenhuma chave falta. **Proibido** texto fixo em template.

### 5.6 Provedores de embed
```ts
interface RteEmbedProvider { id: string; hosts: string[]; match(url: string): boolean; toEmbed(url: string): { src: string; height?: number; aspectRatio?: string } }
```
Padrão: YouTube, Vimeo, Spotify. X/Instagram **não** entram (exigem script de terceiros); documentar como criar um provedor "link com cartão" seguro.

## 6. Angular 22: tecnologias adotadas, formulários e desempenho

> **Como esta seção foi levantada:** consulta à documentação oficial do Angular (guias de Signal Forms e Angular Aria, código-fonte `@publicApi 22.0`) e a artigos sobre o lançamento do 22, em 2026-10-02. Itens marcados **(confirmar)** vieram só de artigos e devem ser conferidos no changelog oficial; **todos os nomes de API devem ser reconfirmados** ao criar o workspace (os esboços de código são de planejamento, não código final).

### 6.1 Tecnologias do Angular 22 e como a lib as usa

| Tecnologia | Estado no 22 | Uso na lib | Ganho |
|---|---|---|---|
| **Signal Forms** (`@angular/forms/signals`: `form()`, `FieldTree`, `[formField]`, `FormValueControl`, `schema()`, validadores, `submit()`, `compatForm`) | **Estável** (`@publicApi 22.0` no código-fonte) | `rte-editor` implementa `FormValueControl<string>`; validadores próprios da lib; formulários internos dos modais usam `form()` | Menos código, reatividade fina, validação declarativa tipada, sem `ControlValueAccessor` no caminho principal |
| **Signals** (`input`, `output`, `model`, `viewChild`, `computed`, `linkedSignal`, `effect`, `afterRenderEffect`) | Estável | API pública e estado interno 100% em signals | Atualizações granulares, sem `detectChanges()` manual |
| **Zoneless + OnPush** | OnPush padrão e apps novos zoneless **(confirmar)** | Funciona sem zone.js; `ChangeDetectionStrategy.OnPush` declarado explicitamente | Menos trabalho do scheduler; menos *re-renders* |
| **Angular Aria** (`@angular/aria`: `toolbar`, `menu`, `listbox`, `combobox`, … + harnesses de teste) | **Estável** **(confirmar)** | Toolbar com *roving tabindex*, menu `/`, seleção de idioma/cor, bubble menu | Acessibilidade padronizada e testada, menos código próprio |
| **`@defer`** (e hidratação incremental) | Estável | Modais, busca, menu `/`, detalhes da imagem, HTML bruto; editor no SSR hidratado sob interação | Bundle inicial menor, menor custo de TTI |
| **`resource` / `httpResource`** | Estáveis **(confirmar)** | Exemplos de carga de conteúdo (demo, render). **Não** para upload (POST com progresso e cancelamento: `HttpClient` + `AbortSignal`) | Estado de carregamento declarativo onde faz sentido |
| **Templates novos** (`@for`/`@if`/`@switch` exaustivo, *spread*/*rest*, funções *arrow* inline em eventos) **(confirmar)** | Estável | Menos métodos-ponte nos componentes; estados da toolbar como `@switch` exaustivo | Templates menores e mais seguros em tipos |
| **Testes** (runner Vitest do Angular, harnesses, `provideZonelessChangeDetection`) | Estável | Suíte rodando **zoneless e com zone.js**; harnesses do Aria | Confiança em ambos os modos |

### 6.2 Integração de formulários: contrato do `rte-editor`

O editor é um **controle de formulário customizado do Signal Forms**. Esboço (confirmar nomes exatos no spike S1):

```ts
@Component({ selector: 'rte-editor', changeDetection: ChangeDetectionStrategy.OnPush, /* … */ })
export class RteEditor implements FormValueControl<string> {
  // contrato obrigatório
  readonly value = model<string>('');
  // estado fornecido pelo sistema de formulários
  readonly touched = input(false);       readonly touch = output<void>();
  readonly disabled = input(false);      readonly readonly = input(false);
  readonly hidden = input(false);        readonly invalid = input(false);
  readonly errors = input<readonly ValidationError[]>([]);
  readonly maxLength = input<number | undefined>(undefined);   // → CharLimit
  readonly required = input(false);
}
```

**Regras de integração**
1. **O formulário manda:** `disabled`, `readonly`, `hidden`, `required`, `maxLength` e `errors` chegam do schema; o editor os reflete (desabilita edição, esconde, mostra `aria-invalid`/`aria-describedby`/`role="alert"` com os erros). `maxLength` do schema vira o limite do `CharLimit` automaticamente.
2. **Restrição do compilador:** com `[formField]`, vincular `[disabled]`, `[readonly]`, `[required]`, `[maxLength]` etc. no mesmo nó gera erro (NG8022). A documentação da lib deve mostrar o jeito certo (regras no schema, ex.: `disabled(path.body, …)`).
3. **`touched`:** `touch.emit()` em *blur* do conteúdo (não ao focar a toolbar nem ao abrir um modal do próprio editor).
4. **Compatibilidade:** além do `FormValueControl`, o componente provê `NG_VALUE_ACCESSOR` para Reactive/Template Forms e funciona com `compatForm` na migração. **Spike S1** valida se os dois contratos coexistem no mesmo componente sem conflito.
5. **Sem formulário:** `[(value)]` funciona isolado.
6. **Formulários internos da lib** (link, mídia, detalhes da imagem, idioma, autor) usam Signal Forms com schema: o próprio produto "come a própria comida".

### 6.3 Validadores da lib (Signal Forms e legado)

Funções para usar em `form()`/`schema()` e equivalentes para `Validators`:

| Validador | O que verifica |
|---|---|
| `rteRequired()` | Há **texto ou mídia** de verdade (não `<p></p>`, não só espaços/`<br>`) |
| `rteMaxChars(n)` / `rteMaxWords(n)` | Limites medidos no **texto**, não no HTML |
| `rteImagesHaveAlt()` | Toda imagem tem `alt` (ou está marcada como decorativa) |
| `rteSafeLinks()` | Só protocolos permitidos; sem `javascript:`/`data:` |
| `rteNoEmptyHeadings()` | Sem títulos vazios (SEO/acessibilidade) |
| `rteUploadsFinished()` | Bloqueia `submit` enquanto há upload em andamento |

Erros **tipados** (autocompletar nas mensagens), com chave de i18n (`RTE_LABELS`).

### 6.4 Estado do editor em signals (substitui o `detectChanges()` do modelo)

- Um serviço **por instância** (`RteEditorState`) liga o Tiptap aos signals: **um único** listener de `transaction`/`selectionUpdate` incrementa um signal de versão.
- Tudo que a UI consome é `computed` **com função de igualdade**: `isActive('bold')`, atributos do link/imagem selecionados, `canUndo`, contagens. Se o valor não mudou, o item da toolbar **não re-renderiza**.
- A instância do `Editor` **não** vai para dentro de signals profundos (evita rastreamento inútil): fica numa referência estável e só a "versão" é reativa.
- Nada de `effect` para sincronizar estado derivado: usar `computed`/`linkedSignal`. `effect` só para efeitos de fato (ex.: aplicar `readonly` ao editor), e `afterRenderEffect` para trabalho que depende do DOM (posicionar menus).
- Ciclo de vida: criar com `afterNextRender` (só no navegador), destruir com `DestroyRef`, `takeUntilDestroyed` onde houver streams.

### 6.5 Estratégia de atualização do valor (`updateOn`)

`getHTML()` é O(tamanho do documento) e hoje roda a **cada tecla**. Plano:
- `updateOn: 'change'` (imediato, padrão compatível), `'debounce'` (padrão recomendado em documentos grandes, ~150 ms) e `'blur'`.
- O estado "alterado" (`isDirty`, `touched`) é imediato; só a **serialização** é adiada, com *flush* garantido em `blur`, `submit`, `getValue()` e `destroy`.
- Comparar versões antes de escrever em `value` para evitar laços (`value` → editor → `value`).
- Medir antes de escolher o padrão (spike S3): documento de 20 mil palavras.

### 6.6 Orçamentos de desempenho (verificados em CI)

| Métrica | Meta inicial (ajustar após o spike S3) | Como medir |
|---|---|---|
| Custo de JS por tecla (digitação) | p95 **< 16 ms** em documento de ~20 mil palavras; INP **< 100 ms** | Playwright + `performance.measure`/trace |
| *Re-renders* da toolbar ao digitar | **0** botões re-renderizados quando o estado ativo não muda | Contadores de render em teste de componente |
| Criação do editor | **< 100 ms** do `afterNextRender` ao interativo | `performance.measure` |
| Bundle do editor | **Orçamento por entry point** (`size-limit`); referência do modelo: ≈ 186 kB transferidos com `highlight.js` inteiro; meta: **menor**, com linguagens sob demanda | `size-limit` no CI |
| Memória | Sem vazamento ao criar/destruir o editor 100× | Teste automatizado (contagem de listeners/nós) |
| SSR/hidratação | Conteúdo existente visível **sem JS** (via `render`) e editor hidratado só sob interação | App SSR de fumaça + Lighthouse |
| Regressão | Falha o CI se qualquer métrica piorar > 10 % | Comparação com baseline |

**Técnicas:** `ChangeDetectionStrategy.OnPush` explícito, `computed` com igualdade, `track` em todo `@for`, `@defer` para o que não é crítico, `import()` das extensões pesadas (tabelas, código, embeds, busca) e das linguagens do `highlight.js`, `ResizeObserver` só com imagem selecionada, *listeners* passivos, nada de trabalho síncrono pesado em `transaction`.

### 6.7 Zoneless e compatibilidade com apps que usam zone.js

- **Alvo:** funcionar em apps **zoneless**; **também** funcionar com zone.js (consumidores existentes). Nada na lib depende de zone.
- Eventos do Tiptap atualizam **signals** (que notificam o scheduler); sem `setTimeout`/`rAF` para "forçar" a detecção de mudanças.
- CI roda a mesma suíte com `provideZonelessChangeDetection()` e com zone.js.

### 6.8 Da forma antiga para a nova (tradução direta)

| Modelo | Projeto novo |
|---|---|
| `@Input()` / `@Output() EventEmitter` | `input()` / `model()` / `output()` |
| `ControlValueAccessor` único | `FormValueControl` (+ CVA de compatibilidade) |
| `ChangeDetectorRef.detectChanges()` | signals + `computed` |
| `ngOnChanges` | `computed`/`effect` sobre inputs; `linkedSignal` |
| `@HostListener` | `host: { '(keydown)': … }` |
| `Subject` + `takeUntil` | `takeUntilDestroyed()` / `DestroyRef` |
| Toolbar/menus com ARIA manual | `@angular/aria` |
| Modais custom com overlay | `<dialog>` nativo (`showModal`) ou CDK Dialog **(spike S2)** |
| `ngx-tiptap` | Wrapper próprio fino (spike S1/S3 decidem) |
| Reactive Forms nos modais | Signal Forms nos modais |

### 6.9 Spikes específicos (Fase 0)

| # | Pergunta a responder | Critério de sucesso |
|---|---|---|
| **S1** | Um componente consegue ser `FormValueControl` **e** `ControlValueAccessor`? `[formField]` + schema (`required`, `maxLength`, `disabled`) funcionam com o editor Tiptap? | Demo com os três modos (Signal Forms, Reactive Forms, `[(value)]`) passando testes |
| **S2** | O Angular Aria cobre a toolbar (grupos, `aria-pressed`, `radiogroup` de alinhamento) e o menu `/` (combobox + listbox)? E o `<dialog>` nativo cobre os modais? | Navegação por teclado completa; axe sem violações sérias; menos código que o modelo |
| **S3** | A ponte Tiptap → signals mantém **0** re-renders desnecessários? Qual o ganho do `updateOn: 'debounce'`? | Números medidos contra o baseline do modelo (digitação em doc de 20 mil palavras) |
| **S4** | A suíte passa **zoneless** e com zone.js? | Mesma suíte verde nos dois modos |
| **S5** | Hidratação incremental: conteúdo estático do `render` + editor hidratado sob interação | LCP do conteúdo sem JS; editor interativo só quando necessário |

### 6.10 Política de versões do Angular

- `peerDependencies`: `@angular/*` `>=22.0.0 <23` na 1.0; acompanhar os *minors* do 22.
- **Só APIs `@publicApi` estáveis** no caminho crítico. Qualquer API experimental/*developer preview* fica atrás de *flag* e fora do fluxo principal.
- CI: Angular 22 mínimo, 22 mais recente e (não bloqueante) `next`/canário.
- Reavaliar `@angular/aria`: se ainda estiver em *preview* em alguma parte usada, manter a abstração interna para trocar sem quebrar a API pública.

### 6.11 Fontes consultadas
- Guia oficial de **Signal Forms** — controles customizados (`FormValueControl`) e `@angular/forms/signals`: <https://angular.dev/guide/forms/signals/custom-controls>
- Guia oficial do **Angular Aria** (toolbar, menu, combobox, listbox): <https://angular.dev/guide/aria/toolbar>
- Resumos do lançamento do Angular 22 (usados só para os itens marcados *confirmar*): [angular.love](https://angular.love/angular-22-key-features-and-changes), [codigotipado](https://www.codigotipado.com/p/angular-22-whats-new), [santoshyadav.dev](https://santoshyadav.dev/blog/2026-06-16-angular-22-the-signals-are-strong/)

## 7. Tema e estilos: "Tema de 3 cores"

> **Status:** decisões T1–T4 tomadas e **spike T6 concluído** (fórmulas CSS validadas em Chromium 153; ver seção 7.15 e `docs/spikes/t6-tema/`). T1–T6 todas decididas/concluídas. O restante é proposta de projeto.

### 7.1 Objetivo

Personalizar o editor deve ser **trivial**: quem quiser a identidade visual da sua marca informa **até 3 cores** e pronto. Quem não informar nada recebe o **tema do Angular** (claro/escuro automático). Tudo mais (hover, estados, fundos suaves, texto legível sobre cada cor, foco, modo escuro) é **calculado pela própria lib**.

### 7.2 Por que isso dá menos trabalho que o Angular Material

| Ponto | Angular Material (típico) | Esta lib (proposta) |
|---|---|---|
| Como se configura | Sass (`@use '@angular/material' as mat`), *mixins* de tema, paletas geradas em build | **3 variáveis CSS** (ou 1 linha de TypeScript); **sem Sass e sem build** |
| Mudar a cor depois | Recompilar | **Em tempo de execução** (variável CSS; funciona até com troca ao vivo) |
| Paleta | Gerada/escrita à mão (tons 50–900 ou esquema M3 completo) | **Derivada** no navegador a partir da cor-semente (`color-mix`, cores relativas em OKLCH) |
| Ajuste fino | Centenas de *tokens* do sistema e por componente (`--mat-sys-*`, `--mat-*-*`) | **Escada de 4 níveis**; só se desce um nível quando precisa (7.3) |
| Sobrescrever CSS | Brigar com especificidade, `::ng-deep`, `!important` | **Camadas CSS (`@layer`)**: o CSS do consumidor **sempre vence**, sem `!important` |
| Contraste/acessibilidade | Responsabilidade de quem monta a paleta | **Automático**: cor do texto sobre a cor (`on-*`) e variante legível (`*-text`); aviso em desenvolvimento se a cor escolhida for problemática |
| Modo escuro | Segundo conjunto de tema | **Um conjunto só** (`light-dark()` + `color-scheme`) |

### 7.3 Escada de personalização (cada degrau é opcional)

| Nível | O que o dev faz | Esforço |
|---|---|---|
| **0** | Nada. Tema Angular padrão, claro/escuro automático | zero |
| **1** | Informa **1 a 3 cores** (as que não informar ficam no padrão) | 1 linha |
| **2** | Ajusta **forma e tipografia**: `--rte-radius`, `--rte-density`, `--rte-font-sans`, `--rte-font-mono`, `--rte-font-size` | poucas linhas |
| **3** | Sobrescreve **papéis** (superfície, texto, borda, perigo, aviso, sucesso, foco) | só se precisar |
| **4** | CSS livre sobre classes estáveis `rte-*` (BEM), dentro de camadas | casos raros |

### 7.4 As 3 cores e seus papéis

Padrão = cores do Angular (valores do modelo, em OKLCH, com o hex aproximado): **confirmar contra `angular.dev/press-kit`** ao iniciar.

| Cor | Padrão | Papel na interface | Papel no conteúdo |
|---|---|---|---|
| **`primary`** | violeta `#8514f5` (`oklch(53.18% 0.28 296.97)`) | Ação principal e estado **ativo**: botão primário, item ativo da toolbar, **foco**, alças de redimensionar, barra de progresso | Links, seleção de texto, marcador de busca atual |
| **`secondary`** | rosa `#f637e3` (`oklch(69.02% 0.277 332.77)`) | Ações secundárias, realces de apoio, *hover* de itens de menu | Borda da **citação em destaque**, rótulo "Leia também" |
| **`tertiary`** | azul `#0546ff` (`oklch(51.01% 0.274 263.83)`) | Indicadores e contadores, itens informativos | Caixa de destaque **"info"**, marca-texto padrão |

**Fora das 3 cores de propósito:** as cores **semânticas** (erro, aviso, sucesso, perigo) permanecem fixas para continuarem reconhecíveis (um "erro" verde confunde o usuário). Ficam ajustáveis só no **nível 3**. O tema do **realce de código** também é separado (`--rte-code-*`, com preset claro e escuro).

### 7.5 Derivação automática (o "motor" de tema, só CSS)

De cada semente saem, em CSS (sem JavaScript):

| Derivada | Para quê |
|---|---|
| `--rte-<cor>-hover`, `--rte-<cor>-active` | Estados interativos |
| `--rte-<cor>-subtle` | Fundo suave (item ativo, callout, realce) |
| `--rte-<cor>-border` | Bordas coloridas |
| `--rte-on-<cor>` | Texto **preto ou branco** sobre a cor, escolhido pela luminosidade |
| `--rte-<cor>-text` | Variante **legível como texto** sobre a superfície atual (clareia no escuro, escurece no claro) |
| `--rte-focus` | Anel de foco (derivado da `primary`, sempre visível) |

**Fórmulas validadas no spike T6** (`docs/spikes/t6-tema/theme.css`). A técnica decisiva: dentro de `color(from <cor> srgb-linear …)` os canais são **lineares**, então a **luminância WCAG** sai em `calc()` e o contraste é **garantido por construção**:

```css
@property --rte-primary { syntax: '<color>'; inherits: true; initial-value: #8514f5; } /* inválido => padrão Angular */

@layer rte.theme {
  .rte-root {
    /* Y = luminância WCAG da semente (canais recortados ao sRGB) */
    --rte-on-primary:     color(from var(--rte-primary) srgb-linear
                            calc(clamp(0, (0.1791 - Y) * 1000, 1)) …);       /* branco se Y ≤ 0.1791, senão preto */
    --rte-primary-hover:  /* afasta da cor do texto: escurece sementes escuras, clareia as claras (14%) */;
    --rte-primary-active: /* idem, 26% */;
    --rte-primary-text:   light-dark(/* escala linear até Y = 0.13 */, /* mistura linear com branco até Y = 0.28 */);
    --rte-primary-subtle: color-mix(in oklch, var(--rte-primary) 12%, var(--rte-surface));
    --rte-primary-border: color-mix(in oklch, var(--rte-primary) 45%, var(--rte-surface));
    --rte-surface: light-dark(oklch(from var(--rte-primary) 0.985 calc(min(c, 0.006) * var(--rte-neutral-tint)) h),
                              oklch(from var(--rte-primary) 0.18  calc(min(c, 0.012) * var(--rte-neutral-tint)) h));
  }
}
```
(As expressões completas, repetidas para `secondary` e `tertiary`, estão em `theme.css`; os `…`/comentários acima abreviam o `Y = 0.2126r + 0.7152g + 0.0722b` repetido em cada canal.) **Um limiar de luminosidade em OKLCH, como previsto no rascunho, não bastava** (falhava em até 2,6:1; ver seção 7.15).

**Neutros** (fundos, bordas, texto secundário): **tingidos pelo matiz da `primary`** com croma muito baixo (superfícies levemente "da marca"), **decidido (T2)**. Há uma opção `neutral: 'gray'` para quem preferir cinza puro. Claro e escuro saem do mesmo conjunto com `light-dark()`.

### 7.6 Como o dev configura (3 formas, mesma prioridade clara)

```css
/* 1) Só CSS: qualquer ancestral, ou global */
:root { --rte-primary: #0ea5e9; }
rte-editor.compacto { --rte-radius: 4px; }
```
```ts
// 2) Global, no app.config.ts
provideRichText({ theme: { primary: '#0ea5e9' } })        // secondary/tertiary: padrão Angular
```
```html
<!-- 3) Por instância -->
<rte-editor [theme]="{ primary: '#0ea5e9', secondary: '#f97316', tertiary: '#22c55e', mode: 'dark' }" />
```

- **Qualquer cor CSS é aceita** (`#hex`, `rgb()`, `hsl()`, `oklch()`, nome, `var(--sua-marca)`); a lib não precisa "parsear": o navegador resolve.
- **Prioridade (a mais específica vence):** `[theme]` da instância > variável CSS num ancestral > `provideRichText` > padrão Angular.
- **Modo:** `mode: 'auto' | 'inherit' | 'light' | 'dark'` (aplicado por `data-rte-mode`). **`auto` (padrão)** segue o **sistema operacional** (`color-scheme: light dark`). **Atenção (medido no spike T6):** `auto` **ignora o toggle de tema do próprio site**; quem tem toggle deve usar **`inherit`** (segue o `color-scheme` do `<html>`) e declarar `color-scheme` no `<html>`.
- **SSR e CSP:** as variáveis são aplicadas por *host binding* (entram no HTML renderizado no servidor, sem "piscar" de cor) usando `style.setProperty`, compatível com CSP restritiva (não exige `style-src 'unsafe-inline'` para atributos gerados por JS).
- **Utilitários:** `createRteTheme({...})` devolve o mapa de variáveis (para usar fora do Angular ou em testes) e `checkRteTheme({...})` devolve o relatório de contraste.

### 7.7 Acessibilidade do tema

- **`on-*` automático** garante texto legível dentro de botões/itens coloridos.
- **`*-text`** ajusta a **luminância real** (escala/mistura linear) para atingir contraste **≥ 4,5:1** contra a superfície e o fundo suave. **Medido no spike T6: 0 falhas em 223 cores sRGB + 148 fora do sRGB, nos dois modos.**
- **Aviso em desenvolvimento** (`isDevMode`): se a cor escolhida não consegue contraste adequado (ex.: amarelo muito claro como `primary` no modo claro), a lib registra um aviso com a sugestão de uma alternativa.
- **Foco visível** sempre ≥ 3:1 (anel + deslocamento), independentemente da cor.
- `prefers-contrast: more` e `forced-colors` respeitados (bordas/foco reforçados; sem depender só de cor).

### 7.8 Camadas, especificidade e `ViewEncapsulation`

- Todo o CSS da lib vive em camadas: `@layer rte.reset, rte.base, rte.theme, rte.components, rte.content;`. **CSS sem camada do consumidor sempre vence**, sem `!important` e sem `::ng-deep`.
- Classes **estáveis e documentadas** com prefixo `rte-` (BEM): `rte-toolbar`, `rte-toolbar__button`, `rte-modal`, `rte-content`… Essas classes são parte da API pública (mudança = versão *major*).
- `ViewEncapsulation.None` com classes prefixadas (o conteúdo do ProseMirror precisa ser estilizado por classe, não por atributo de encapsulamento). Nenhum estilo global vaza.

### 7.9 Pacote de tema compartilhado

O editor **e** o conteúdo publicado precisam ficar iguais. Proposta: um pacote minúsculo **`@escopo/rte-theme`** (CSS dos tokens/derivações + `createRteTheme` + `checkRteTheme`), dependência de `angular` e `render`. Assim, mudar as 3 cores muda editor e site juntos. **Decidido (T5): pacote separado.** Conteúdo: `theme.css` (validado no spike T6), `createRteTheme`/`checkRteTheme` (plano B em JavaScript, mesma matemática) e os tipos `RteTheme`. Sem dependência de Angular, para poder ser usado também por `core`/`sanitizer` (ex.: relatório de contraste) e por outros frameworks no futuro.

### 7.10 Contrato de variáveis

| Nível | Variáveis (públicas, estáveis) |
|---|---|
| 1 | `--rte-primary`, `--rte-secondary`, `--rte-tertiary` |
| 2 | `--rte-radius`, `--rte-density` (compacta/confortável), `--rte-font-sans`, `--rte-font-mono`, `--rte-font-size`, `--rte-line-height` |
| 3 | `--rte-surface`, `--rte-surface-raised`, `--rte-text`, `--rte-text-muted`, `--rte-border`, `--rte-focus`, `--rte-danger`, `--rte-warning`, `--rte-success`, `--rte-code-*` |
| derivadas | `--rte-<cor>-hover/-active/-subtle/-border/-text`, `--rte-on-<cor>` (calculadas; **podem** ser sobrescritas, mas não é o caminho esperado) |
| internas | `--_*` (nunca documentadas nem estáveis) |

### 7.11 Playground e presets (no app `demo`)

Seletores das 3 cores, modo, raio e densidade com **pré-visualização ao vivo**, relatório de contraste, botão **"copiar CSS / copiar TypeScript"** e presets prontos (Angular, Oceano, Floresta, Pôr do sol, Monocromático). É também a melhor documentação do tema.

### 7.12 Compatibilidade de navegadores

Depende de **cores relativas** (inclusive `color(from … srgb-linear …)` com `calc()`), `color-mix()`, `light-dark()` e `@property` (navegadores atuais, 2024+). **Verificado só em Chromium 153**; Firefox e WebKit entram na matriz da Fase 6. Para navegadores sem esse suporte, `@supports` aplica um **plano B**: `createRteTheme` entrega as derivadas **pré-calculadas em JavaScript** (hex), mantendo o mesmo resultado visual (**spike T6: ΔE = 0 nos derivados lineares e ≤ 0,019 nos neutros; desvio máximo 0,041 só em `*-border`; mesmos contrastes**). A matriz de navegadores suportados fica documentada.

### 7.13 Testes do tema

- Unitários de `createRteTheme`/`checkRteTheme` (derivação e contraste) com sementes **extremas** (muito claras, muito escuras, saturadas, cinzas, acromáticas).
- **Regressão visual** (Playwright): tema padrão e 4 temas personalizados × claro/escuro × densidades.
- Teste de **prioridade** (instância > CSS > provider > padrão) e de **camadas** (CSS do consumidor sem `!important` vence).
- Verificação de **SSR** (variáveis presentes no HTML do servidor) e de **CSP**.
- Teste do **plano B** (sem cores relativas) comparando com o resultado nativo.

### 7.14 Decisões em aberto sobre o tema

| # | Decisão | Opções |
|---|---|---|
| T1 | **Nome da 3ª cor** | ✅ **`tertiary`** (`--rte-tertiary`, `theme.tertiary`) |
| T2 | **Neutros** (fundos, bordas, texto secundário) | ✅ **Tingidos pelo matiz da `primary`**; opção `neutral: 'gray'` para cinza puro |
| T3 | **Modo claro/escuro padrão** | ✅ **`auto`** (segue `color-scheme`/`prefers-color-scheme`; dá para forçar por input ou atributo) |
| T4 | **Cores semânticas** (erro/aviso/sucesso) | ✅ **Fixas**, ajustáveis só no nível 3 (`--rte-danger`, `--rte-warning`, `--rte-success`) |
| T5 | **Pacote de tema** | ✅ **`@escopo/rte-theme` separado** (editor e conteúdo publicado usam o mesmo CSS; sem dependência de Angular) |
| T6 | **Spike do tema (Fase 0)** | ✅ **Concluído** (2026-10-02): fórmulas CSS finais, contraste garantido, plano B equivalente. Ver 7.15 e `docs/spikes/t6-tema/` |

### 7.15 Resultado do spike T6 (resumo)

Detalhes, tabelas e scripts reproduzíveis: **`docs/spikes/t6-tema/README.md`**.

| Pergunta | Resposta |
|---|---|
| Dá para derivar tudo de 3 cores só com CSS? | **Sim.** Tokens de estado, fundos suaves, texto legível, foco e neutros, em claro e escuro, sem Sass/build/JS |
| O contraste é garantido? | **Sim, por construção:** 10 verificações × (223 cores sRGB + 148 fora do sRGB) × 2 modos = **0 falhas**; texto sobre a cor ≥ 4,61 (limite teórico ≈ 4,58), foco ≥ 5,5, texto neutro ≥ 16 |
| A ideia original (limiar em OKLCH) funcionava? | **Não:** até 2,6:1 em `active` e 24 cores abaixo de 4,5 mesmo com o melhor limiar. Foi trocada pela **luminância real em `srgb-linear`** |
| Valor inválido quebra a UI? | **Não:** `@property <color>` cai no padrão Angular |
| Prioridade e camadas | Padrão < `:root` < ancestral < instância; CSS do consumidor sem camada **vence sem `!important`** |
| Custo de trocar a cor ao vivo | ≈ 0,2 ms |
| Plano B (JS) | Equivalente (ΔE ≈ 0; mesmos contrastes); em `*-border` o desvio máximo é 0,041 |
| Modo | `auto` segue o sistema e **ignora o toggle do site**; apps com toggle devem usar `inherit` |
| Limites | Só Chromium 153 verificado; WCAG 2.x (não APCA); grade de sementes ampla mas não exaustiva; sem teste visual de componentes |

**Consequências para o plano:** (1) `on-*`, `*-text` e estados passam a usar a técnica do 7.5; (2) o modo ganha o valor `inherit` e a regra do toggle; (3) Firefox/WebKit entram na matriz de CI da Fase 6; (4) teste de propriedade com sementes aleatórias entra na Fase 6.

## 8. Fases e entregáveis

Cada fase termina com **critérios de aceite** verificáveis. Esforço relativo: **P/M/G**.

### Fase 0 — Fundamentos (M)
- [ ] Definir **nome do produto/pacotes e escopo npm** (checar disponibilidade e marca) **[DECIDIR]**
- [ ] Criar repositório (monorepo), licença MIT, `CONTRIBUTING`, `SECURITY.md`, CI base
- [ ] Criar o workspace **já em Angular 22.x** e confirmar a faixa de versões suportada do Tiptap 3.x; verificar se o `ngx-tiptap` (peer `>=20`, sem garantia de que cobre o 22) funciona com o Angular 22 **[DECIDIR: usar `ngx-tiptap` ou integrar o `Editor` direto]**. Atenção: o código do modelo foi escrito e testado em Angular 21.2; ao copiá-lo, revisar mudanças de API entre 21 e 22 (a verificação de tipos e os testes do novo projeto mostram o que quebra)
- [ ] Decidir ícones (SVG internos) e overlay (CDK ou próprio)
- [x] **Spike T6 do tema (seção 7.15):** fórmulas CSS de derivação, contraste em sementes extremas e plano B — **concluído**; falta só levar `theme.css` para o pacote de tema e testar em Firefox/WebKit (Fase 6)
- [ ] **Executar os spikes S1 a S5 da seção 6.9** (Signal Forms + CVA, Angular Aria, ponte para signals com medições, zoneless × zone, hidratação) e registrar os resultados em ADRs
- **Aceite:** repositório com CI verde rodando lint + um teste "hello"; decisões registradas em `docs/decisions/` (ADRs)

### Fase 1 — `core` (M–G)
- [ ] Copiar extensões e utilitários do modelo (ver seção 11) para `packages/core`, **sem imports de Angular**
- [ ] Criar o **esquema do HTML** (4.1) e os testes de contrato **gerados a partir dele**
- [ ] Portar os testes existentes (editor em jsdom com Tiptap real) e a fábrica `createEditorExtensions`
- [ ] Linguagens do realce de código **sob demanda** (registro por linguagem)
- **Aceite:** `npm test` do core verde; contrato: HTML de um documento "com todos os recursos" ⊆ esquema; bundle do core medido e registrado

### Fase 2 — `sanitizer` (M)
- [ ] `sanitizeRichText` com allowlist **derivada do esquema**; opções de provedores/estilos/limites
- [ ] Testes: XSS (payloads conhecidos, mXSS, `srcset`/`style`/`svg`/`data:`), idempotência, contrato com o fixture do core
- [ ] **Benchmark** `sanitize-html` × `DOMPurify` (tamanho no navegador, velocidade, SSR) e decisão registrada
- [ ] Fuzzing leve (ex.: `fast-check`) com a propriedade "saída nunca contém script/handler/`javascript:`"
- **Aceite:** suíte de segurança verde; documento de ameaças (`docs/security.md`)

### Fase 3 — Editor Angular autocontido (G)
- [ ] Projeto `angular` com `ng-packagr`; componente standalone `RteEditor` + `ControlValueAccessor`
- [ ] **Implementar o tema de 3 cores (seção 7):** derivação em CSS, camadas, `provideRichText({ theme })`, `[theme]`, modo claro/escuro, utilitários `createRteTheme`/`checkRteTheme`, plano B sem cores relativas
- [ ] **Reescrever UI sem Tailwind/design system** (toolbar, bubble menus, modais, menu `/`, busca, imagens) com CSS `--rte-*` (seção 7)
- [ ] Controles internos (botão, campo, checkbox, radio, select) **acessíveis**; *focus trap* nos modais
- [ ] **Adaptador de upload** (5.3) + `httpUploadAdapter`; cancelamento real; `onMediaRemoved`
- [ ] **i18n** (5.5) com pt-BR/en/es e teste de completude
- [ ] **Toolbar configurável + feature flags + provedores de embed** (3.3)
- [ ] **SSR-safe** (3.4) e acessibilidade (roving tabindex, ARIA, `aria-live`) com **Angular Aria**
- [ ] **Signal Forms de ponta a ponta:** `FormValueControl` + compatibilidade com Reactive Forms, validadores `rte*` (6.3), formulários internos dos modais com `form()`
- [ ] **API em signals e OnPush/zoneless** (6.4 e 6.7), `updateOn` (6.5), `@defer` e imports dinâmicos de extensões pesadas
- [ ] API pública fechada (`index.ts`) + api-extractor
- **Aceite:** demo funcionando sem Tailwind; **uso com `[formField]`, `formControlName` e `[(value)]`**; axe sem violações sérias; app SSR de fumaça compila e renderiza; suíte verde **zoneless e com zone.js**; orçamentos da seção 6.6 atendidos; todas as strings em `RTE_LABELS`

### Fase 4 — `render` (M)
- [ ] `RteHtmlPipe`/diretiva (modo `sanitize` por padrão), `RteTocComponent`, `rte-content.css`
- [ ] Teste de renderização do **fixture do editor** (visual) e em SSR
- **Aceite:** conteúdo do fixture aparece idêntico ao do editor (screenshot) e sem scripts executáveis

### Fase 5 — Documentação, demo e exemplos (M)
- [ ] Site de docs (guia, API, temas, i18n, upload, segurança, SSR, migração)
- [ ] App demo/playground; `examples/server-node` com upload, sanitização e **limpeza de órfãs**
- **Aceite:** um desenvolvedor novo instala e tem editor + upload + exibição em **≤ 15 minutos** seguindo só a documentação (testar de verdade)

### Fase 6 — Qualidade e CI (M–G)
- [ ] **Playwright** em Chromium/Firefox/WebKit: fluxos da seção 9
- [ ] **Benchmarks de desempenho da seção 6.6 no CI** (digitação, re-renders, criação, memória, bundle) com *baseline* e falha em regressão > 10 %
- [ ] axe (a11y), regressão visual, `size-limit`, `publint`/`attw`, **teste de instalação em app Angular 22 limpo**, matriz Angular × Tiptap
- **Aceite:** pipeline obrigatório para merge; relatório de cobertura e tamanho publicado

### Fase 7 — Pré-lançamento e **validação em um projeto consumidor** (M)
- [ ] Publicar `0.x` com a tag `next` (ou `npm pack`/Verdaccio local)
- [ ] **Consumir a lib num projeto real e testar a configuração** (seção 10). O MyPresentation pode servir de consumidor **opcional** (hoje em Angular 21.2: só entra se for atualizado para o 22; caso contrário usar o app `demo` e outro projeto Angular 22)
- [ ] Corrigir o que a integração real revelar
- **Aceite:** checklist da seção 10 100% verde no consumidor escolhido

### Fase 8 — v1.0 (P–M)
- [ ] Congelar API pública, changelog, anúncio, política de suporte/depreciação
- [ ] Revisão final de licenças (`THIRD-PARTY-NOTICES`) e de segurança
- **Aceite:** `1.0.0` no npm com `--provenance`

## 9. Estratégia de testes (portas de qualidade)

| Camada | Ferramenta | O que cobre |
|---|---|---|
| Unitário puro | Vitest | utilitários, esquema, embeds, resize, TOC, rascunho |
| Editor em jsdom | Vitest + Tiptap real | round-trip de cada recurso, comandos, busca, NodeView (já existe no modelo) |
| Componentes Angular | Vitest + TestBed | `FormValueControl`/CVA, modais, toolbar, i18n, adaptador de upload |
| **Formulários** | Vitest + Signal Forms | schema com `required`/`maxLength`/`disabled`, validadores `rte*`, estados `touched`/`errors`, os 3 modos de uso |
| **Zoneless e zone.js** | Vitest com `provideZonelessChangeDetection()` e com zone.js | a mesma suíte nos dois modos |
| **Desempenho** | Playwright + `performance.measure`, contadores de render | digitação, re-renders, criação, memória, regressão > 10 % |
| **Aria** | Harnesses do `@angular/aria` | navegação da toolbar e do menu `/` por teclado |
| **Contrato** | Vitest | HTML do editor ⊆ esquema ⊆ allowlist do sanitizador (já existe no modelo) |
| Segurança | Vitest + fast-check | payloads XSS, propriedade "nunca executável" |
| **E2E em navegador real** | Playwright (3 engines) | digitar, formatar, colar print, arrastar imagem, **redimensionar pelos cantos**, menu `/`, Ctrl+F, modal de link com `rel`, upload, rascunho + `beforeunload`, Vimeo/Spotify, tabela, desfazer/refazer, teclado virtual (emulação mobile) |
| Acessibilidade | axe + roteiro manual com leitor de tela | toolbar, modais, anúncios, foco |
| Visual | Playwright screenshots | claro/escuro, imagens, blocos |
| SSR | app Angular SSR | não quebra no servidor; render da exibição |
| Pacote | publint, attw, instalação limpa | exports, tipos, peer deps |
| Tamanho | size-limit | orçamento por entry point |

**Regra:** nenhum recurso é "feito" sem teste automatizado **e** verificação em navegador real.

### 9.1 Como o E2E do modelo foi montado (para repetir no projeto novo)
- **API simulada no navegador** (`page.route`): o editor roda contra respostas falsas de upload/salvar, sem back-end; a sessão é um token fictício em `sessionStorage` para passar pelo guard de rota. Rápido, determinístico e sem banco.
- **Acesso ao editor Tiptap** pelo objeto global `ng.getComponent(...)` (existe só em **build de desenvolvimento**): permite posicionar seleção e ler o `getHTML()` sem depender da interface. No projeto novo, expor um *hook* de teste estável em vez de depender de `ng`.
- **O E2E exige um build que compila.** O `nx serve` pode ficar servindo um bundle antigo quando há erro de tipo; o CI deve rodar `build` junto dos testes.
- **Ambientes sem as bibliotecas do Chromium** (ex.: WSL): extrair `libnspr4`, `libnss3` e `libasound2` de `.deb` numa pasta e usar `LD_LIBRARY_PATH`; passar o binário em `launchOptions.executablePath` (variável `CHROME`). `BASE_URL` aponta para um servidor já no ar.
- **Dois testes de API** do back-end de referência (upload com magic bytes, sanitização, limpeza de órfãs) rodam contra MySQL descartável em contêiner.

## 10. Plano de integração e validação num projeto consumidor (Fase 7)

Objetivo: provar que o pacote funciona em um projeto real **sem** o código do modelo. O roteiro abaixo foi escrito para o MyPresentation (que tem back-end com upload, sanitização e limpeza de órfãs), mas vale para qualquer app Angular 22+ com um servidor equivalente. **Pré-requisito:** o consumidor precisa estar em Angular 22+ (o MyPresentation só participa se for atualizado; isso não faz parte deste plano).

**Passos**
1. Gerar tarballs (`npm pack`) ou publicar em registry local (Verdaccio); instalar `core`, `angular`, `sanitizer`, `render` no MyPresentation.
2. **Back-end:** trocar `sanitize-rich-text.ts` por `@escopo/rte-sanitizer`; manter a migration de sanitização (dados antigos) rodando com o pacote; manter limpeza de órfãs.
3. **Upload:** escrever o adaptador do MyPresentation (`/media/upload`, resposta `{data:{url,variants}}`) usando `httpUploadAdapter({ mapResponse })` — **sem** depender dos interceptors do editor.
4. **control-panel:** substituir `@org/ui-forms/rich-text` por `@escopo/rte-angular` nas páginas Sobre e Seções da home; ligar rascunho e `markSaved()`.
5. **front-end:** substituir `RichHtmlPipe`/`rich-content.scss`/`ui-rich-toc` por `@escopo/rte-render`.
6. Remover o editor antigo de `libs/forms` e os estilos/arquivos órfãos; rodar `nx run-many -t test,lint,build`.

**Checklist de validação (manual + automatizada)**
- [ ] Conteúdo antigo (já salvo) abre, edita e salva sem perda (H1→H2, `<img>` legado, links)
- [ ] Upload por modal e por colar/arrastar; cancelar upload realmente cancela
- [ ] Redimensionar imagem pelos 4 cantos; largura por campo numérico; `srcset/sizes` atualizados
- [ ] Menu `/`, Ctrl+F, rascunho, aviso ao sair, contador
- [ ] Todos os blocos de notícia renderizam **igual** no editor e no site
- [ ] Tema claro/escuro e sobrescrita de `--rte-*` com a identidade do MyPresentation
- [ ] Idioma pt-BR completo (nenhuma string em inglês aparecendo)
- [ ] SSR do front-end sem erro; HTML do conteúdo sem script
- [ ] Peso do chunk do editor dentro do orçamento
- [ ] E2E do back-end (inclui limpeza de órfãs) e Playwright dos apps verdes

## 11. O que reaproveitar do modelo (mapa de arquivos)

Tudo aqui é **copiado/adaptado para o projeto novo**; o modelo permanece como está.

| Origem (MyPresentation, só referência) | Destino no projeto novo | Ação |
|---|---|---|
| `…/rich-text-editor/extensions/*.ts` | `core` | **Copiar** (sem mudanças de lógica) |
| `…/editor-extensions.ts`, `utils/*.ts` (link, embed, heading-id, resize, image, reading-time, draft) | `core` | **Copiar**; `draft` ganha `DraftStorage` injetável |
| `…/editor-extensions.spec.ts`, `extensions/*.spec.ts`, `utils/*.spec.ts` | `core` | **Copiar** (base dos testes) |
| `apps/back-end/src/common/sanitize/sanitize-rich-text.ts` (+ `reading-time.ts`, specs, `fixtures/editor-output.html`) | `sanitizer` | **Refatorar** para derivar do esquema |
| `libs/ui/src/lib/rich-html/*` (`rich-html.pipe`, `rich-toc*`, `rich-content.scss`) | `render` | **Reescrever** estilos em `--rte-*` |
| `rich-text-editor.component.*`, `toolbar/`, `bubble-menu/`, `image-menu/`, `slash-menu/`, `search-bar/`, `modals/` | `angular` | **Reescrever a UI** (sem Tailwind/design system), manter a lógica |
| `services/editor-media.service.ts` | `angular` | **Substituir** por adaptador injetável |
| Componentes irmãos (`base-input`, `checkbox`, `button`, `radio-group`, `checkbox-group`) | — | **Não migram**: viram controles internos |
| `apps/back-end/src/media/*` (upload, magic bytes, limpeza de órfãs, migration) | `examples/server-node` | **Portar como exemplo de referência** (a lib não fala com banco) |
| `docs/rich-text-pendencias.md` | `docs/` | Histórico/lições |

> Ao copiar: o modelo está em Angular 21.2 (standalone, signals, `ControlValueAccessor`); revisar o que mudou no Angular 22 antes de assumir que compila.

## 12. Riscos e decisões em aberto

| # | Item | Impacto | Como decidir |
|---|---|---|---|
| 1 | **Compatibilidade das dependências com Angular 22** (Tiptap 3.x, `ngx-tiptap`, `@angular/cdk`) e diferenças de API entre o 21.2 do modelo e o 22 ao copiar código | Médio | Spike na Fase 0 num workspace 22 limpo; o projeto novo já nasce no 22 |
| 2 | Usar **`ngx-tiptap`** ou integrar `Editor` direto | Médio | Spike; integrar direto reduz uma dependência |
| 3 | Engine de sanitização (sanitize-html × DOMPurify) | Alto (segurança e peso) | Benchmark na Fase 2 |
| 4 | Modo padrão do pipe de exibição (`sanitize` × `trusted`) | Alto | Decidir após o benchmark; preferir seguro por padrão |
| 5 | Ícones próprios × `lucide-angular` × `@angular/cdk` (overlay) | Médio | Medir peso e acessibilidade |
| 6 | Nome do produto/escopo npm e marca | Médio | Checar npm, domínio e marcas na Fase 0 |
| 7 | Armazenar **HTML** ou **JSON**; migração de conteúdo entre formatos | Médio | Manter HTML como padrão e JSON opcional |
| 8 | Suporte a mobile/teclado virtual | Médio | Fase 6 (Playwright mobile) |
| 9 | Roadmap de monetização (módulo Pro) sem quebrar o MIT | Baixo na v1 | Definir fronteira Core/Pro antes da 1.0 |
| 10 | Manutenção a longo prazo (issues, segurança) | Alto | Política de suporte e SECURITY.md na Fase 0 |
| 11 | **Nomes e contratos das APIs novas do 22** (Signal Forms, Aria) podem diferir do esboço; partes marcadas *(confirmar)* vieram de artigos | Médio | Spikes S1 e S2; usar só `@publicApi`; ADRs com o resultado |
| 12 | `FormValueControl` e `ControlValueAccessor` não coexistirem no mesmo componente | Médio | Spike S1; plano B: dois componentes finos sobre o mesmo núcleo |
| 13 | Ganho de desempenho esperado não se confirmar (metas da seção 6.6 são hipóteses) | Médio | Spike S3 mede antes de assumir; metas ajustadas com dados |
| 14 | Dependência do `@angular/aria` aumentar peso/acoplamento ou não cobrir o layout do editor | Médio | Spike S2; abstração interna para poder trocar |
| 15 | **Derivação automática de cores** gerar combinações ilegíveis com cores arbitrárias, ou depender de recursos CSS novos (cores relativas) | Médio | **Spike T6 concluído** (0 falhas de contraste, plano B equivalente); falta confirmar em Firefox/WebKit (Fase 6) e teste de propriedade |

## 13. Lições do projeto modelo (armadilhas a evitar)

Todas aconteceram de verdade e foram pegas por testes; vale transformar cada uma em teste desde o início:
1. **`"composite": true` em `tsconfig.spec.json`** faz o plugin do Analog emitir `export {}` e o Vitest falhar com "No test suite found".
2. **Componente de formulário sem `ControlValueAccessor`** usado com `formControlName` quebra em runtime (NG01203): testar cada controle com reactive forms.
3. **URL fixa `'/api'` no serviço de upload + interceptor que prefixa a base** gerou `/api/api/media/upload` (404). A lib **não** deve assumir interceptors do host.
4. **Mutar `extension.options` não funciona no Tiptap 3:** para valores dinâmicos usar função (`Placeholder`) ou plugin que lê o valor a cada transação (`CharLimit`).
5. **`created_at` do banco × relógio da aplicação:** medir idades no relógio do banco (limpeza de órfãs).
6. **`@IsUrl()` rejeita `localhost`:** usar `require_tld: false` em ambiente de desenvolvimento.
7. **Um spec dentro da pasta de migrations** foi carregado pelo TypeORM como se fosse migration.
8. **Barrel que reexporta o editor** (Tiptap + highlight.js ≈ 1 MB) levava o editor para o bundle inicial: manter **entry points secundários** e `sideEffects: false`.
9. **Sanitizador × editor divergem em silêncio** (ex.: `mark` perdia `data-color`, blocos novos não aceitos): **teste de contrato obrigatório** gerado do esquema.
10. **Ids de título só eram gerados no primeiro edit** e `<a>` sem `target` virava `_blank`: testar o **carregamento inicial** de conteúdo, não só a edição.
11. **Lixo de uploads:** nada limpava mídia removida do editor; projetar o ciclo de vida da mídia desde o início (5.4).
12. **Teste que passa só no jsdom não é verificação:** layout, foco, seleção e arrastar precisam de navegador real (Playwright).
13. **BubbleMenu do Tiptap 3:** o elemento do menu precisa **começar oculto**; o plugin só passa a controlar a visibilidade depois do primeiro `show()`. Sem isso o menu fica sempre visível (bug que só aparece em navegador real).
14. **Posição de inserção ≠ posição final do nó:** `insertContentAt` em parágrafo vazio desloca o nó; localizar a mídia recém-inserida pelo `src` em vez de reutilizar a posição. Em parágrafo vazio a figura deve **substituir** o parágrafo.
15. **Vitest não checa tipos:** um erro de TypeScript passa nos testes e só aparece no build (e no `serve`, que pode ficar servindo um bundle antigo sem avisar). Rodar `build` junto dos testes no CI.
16. **Clicar numa imagem já selecionada** move o cursor para perto dela (padrão do ProseMirror), e o selecionado inicial de um documento que termina em figura é a própria figura: testes E2E precisam tirar o cursor antes.
17. **Chromium headless:** `Ctrl+End` não colapsa a seleção; usar `editor.commands.focus('end')` e esperar o foco (o `focus` do Tiptap é assíncrono). Alças fora da área visível não recebem o mouse: rolar antes.
18. **Conteúdo legado:** regra de leitura para `<p><img></p>` (senão sobra um parágrafo vazio) e teste de carga inicial de conteúdo antigo.

## 14. Próximos passos imediatos

1. Você revisar este plano (em especial a **seção 6**, Angular 22) e responder às decisões **[DECIDIR]** (principalmente 2, 3 e 6 da seção 12).
2. Fase 0: criar o **repositório novo já em Angular 22** e fazer os **spikes**: S1–S5 da seção 6.9 (Signal Forms, Aria, ponte para signals, zoneless, hidratação) e o benchmark de sanitização.
3. Fase 1: levar `core` e o esquema do HTML, com os testes do modelo rodando.

---
*Documento mantido junto ao projeto modelo. Atualize a seção 0 (decisões) e o checklist das fases à medida que o trabalho avançar.*
