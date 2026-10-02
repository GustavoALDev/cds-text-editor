# Spec 05 — Editor Angular (`@cds/rte-angular`)

> Depende das specs 02 e 03. Referência: plano seções 3.2, 3.3, 3.6, 5, 6 e 8 (Fase 3). Modelo (MyPresentation): `rich-text-editor.component.*`, `toolbar/`, `bubble-menu/`, `image-menu/`, `slash-menu/`, `search-bar/`, `modals/`, `services/editor-media.service.ts`.
> **Esta é a maior spec.** Na fase de plano, dividir em marcos (ver seção 9); cada marco com seu próprio aceite.

## 1. Objetivo

O componente `rte-editor`: nativo do **Angular 22** (Signal Forms, signals, zoneless/OnPush, Aria, `@defer`), sem Tailwind e sem design system, com toolbar configurável, i18n, acessibilidade, adaptador de upload e foco em **desempenho medido**.

## 2. Fora de escopo

Esquema/extensões/sanitização (specs 03 e 04); tema (spec 02, consumido aqui); exibição do conteúdo publicado (spec 06); demo (spec 07).

## 3. Decisões já tomadas

Signal Forms é o caminho principal (`FormValueControl` + `[formField]`); `ControlValueAccessor` só como compatibilidade; API 100% signals; OnPush explícito; zoneless **e** zone.js; só APIs `@publicApi` estáveis no caminho crítico; CSS próprio `--rte-*` em camadas; `ViewEncapsulation.None` com classes `rte-*` estáveis (BEM) como API pública.

## 4. Decisões e spikes (primeiro marco)

**Decididas (2026-10-02):** `Editor` do Tiptap **direto**, com wrapper fino próprio (`afterNextRender` cria, `DestroyRef` destrói), **sem `ngx-tiptap`**; **ícones SVG internos** (~45, sem `lucide-angular`); **`<dialog>` e popover nativos**, **sem `@angular/cdk`**. Os spikes abaixo **confirmam** essas escolhas; se um deles as invalidar, registrar em ADR e voltar a este ponto.

| # | Pergunta | Aceite do spike |
|---|---|---|
| S1 | Um componente é `FormValueControl` **e** `ControlValueAccessor`? `[formField]` + schema (`required`, `maxLength`, `disabled`) funcionam com o Tiptap? | Demo com 3 modos (Signal Forms, Reactive Forms, `[(value)]`) passando testes. Plano B: dois componentes finos sobre o mesmo núcleo |
| S2 | O Angular Aria cobre toolbar (`aria-pressed`, `radiogroup`), menu `/` (combobox + listbox) e bubble menu? O `<dialog>` nativo cobre os modais? | Teclado completo; axe sem violações sérias; menos código que o modelo |
| S3 | A ponte Tiptap → signals mantém **0** re-renders desnecessários? Ganho do `updateOn: 'debounce'`? | Medidas em documento de 20 mil palavras contra o baseline do modelo |
| S4 | A suíte passa zoneless e com zone.js? | Mesma suíte verde nos dois modos |

Resultados em ADRs. **Nenhum marco seguinte começa sem o S1 e o S2 resolvidos.**

## 5. API pública

### 5.1 Configuração e uso
```ts
provideRichText({ locale: 'pt-BR', theme: { primary: '#0ea5e9' }, upload: httpUploadAdapter({ endpoint: '/api/media/upload' }) })
```
```html
<rte-editor [formField]="form.body" ariaLabel="Texto da matéria" />   <!-- Signal Forms -->
<rte-editor formControlName="content" />                              <!-- Reactive Forms (compat) -->
<rte-editor [(value)]="html" />                                       <!-- sem formulário -->
```

### 5.2 Entradas e saídas (signals)
- **Contrato de controle:** `value` (`model`), `touched`/`touch`, `disabled`, `readonly`, `hidden`, `invalid`, `errors`, `pending`, `required`, `maxLength`, `name`.
- **Configuração:** `placeholder`, `minHeight`/`maxHeight`, `showWordCount`/`showCharCount`, `toolbar` (preset `minimal|article|full` ou configuração por grupos/itens/ordem), `features`, `draftKey`, `format` (`html|json`), `updateOn` (`change|debounce|blur`), `extensions`, `labels`, `ariaLabel`, `theme`.
- **Saídas:** `contentChange`, `editorReady`, `editorFocus`, `editorBlur`, `uploadError`, `mediaChange` (URLs adicionadas/removidas na sessão).
- **Estado exposto (somente leitura):** `isEmpty`, `wordCount`, `charCount`, `readingTime`, `isDirty`, `editor`. Métodos: `markSaved()`, `focus()`, `getValue()` (força *flush*).

### 5.3 Regras de integração com formulários
1. O formulário manda: `disabled`, `readonly`, `hidden`, `required`, `maxLength`, `errors` chegam do schema; o editor reflete (`aria-invalid`, `aria-describedby`, `role="alert"`). `maxLength` vira o limite do `CharLimit`.
2. Vincular `[disabled]`, `[readonly]`, `[maxLength]` etc. junto de `[formField]` gera NG8022: a documentação mostra o jeito certo (regras no schema).
3. `touch.emit()` só em *blur* do **conteúdo** (não ao focar a toolbar nem ao abrir modal do editor).
4. Comparar versões antes de escrever em `value` (sem laço `value → editor → value`).
5. `updateOn`: estado `isDirty`/`touched` é imediato; só a **serialização** é adiada, com *flush* em `blur`, `submit`, `getValue()` e `destroy`.

### 5.4 Validadores (Signal Forms e `Validators`)
`rteRequired` (texto ou mídia de verdade, não `<p></p>`), `rteMaxChars`/`rteMaxWords` (medidos no texto), `rteImagesHaveAlt` (ou decorativa), `rteSafeLinks`, `rteNoEmptyHeadings`, `rteUploadsFinished`. Erros tipados com chave de i18n.

### 5.5 Upload
```ts
interface RteUploadAdapter {
  uploadImage(file: File, ctx: { signal: AbortSignal; onProgress(p: number): void }): Promise<RteUploadedImage>;
  uploadVideo?(file: File, ctx: …): Promise<RteUploadedVideo>;
  registerExternal?(url: string, type: 'image' | 'video'): Promise<{ url: string }>;
  onMediaRemoved?(url: string): void;
}
```
`httpUploadAdapter({ endpoint, fieldName, headers, withCredentials, mapResponse })` pronto. **Cancelamento real** (`AbortSignal`). A lib **não** depende de interceptors do host (lição 3). Ciclo de vida da mídia: `mediaChange` entrega URLs adicionadas e removidas na sessão (órfãs no servidor são tratadas pelo exemplo da spec 07).

### 5.6 i18n
Token `RTE_LABELS` com objeto tipado de **todas** as strings (toolbar, modais, menu `/`, erros, `aria-label`). Pacotes `pt-BR`, `en`, `es` no entry point `/i18n`; fallback `en`; teste de completude; **texto fixo em template é proibido** (lint ou teste).

### 5.7 Entry points
`/` (componente, `provideRichText`, validadores), `/styles` (CSS), `/i18n`, `/testing` (harness e gancho de teste estável para o `Editor`, em substituição ao `ng.getComponent` do modelo).

## 6. Requisitos

### 6.1 Estado e desempenho
- **R1.** Serviço **por instância** liga o Tiptap a signals: um único listener de `transaction`/`selectionUpdate` incrementa um signal de versão; tudo que a UI consome é `computed` **com função de igualdade**. A instância do `Editor` fica em referência estável, fora de signals profundos.
- **R2.** **Zero** `ChangeDetectorRef.detectChanges()`, `requestAnimationFrame`/`setTimeout` para forçar detecção, `@Input`/`@Output` decorators, `ngOnChanges`, `@HostListener`, `Subject + takeUntil` (usar `takeUntilDestroyed`, `host: {}`).
- **R3.** Criação do `Editor` em `afterNextRender` (só navegador); destruição por `DestroyRef`.
- **R4.** Orçamentos (metas iniciais, ajustadas após o S3): digitação p95 < 16 ms em 20 mil palavras; INP < 100 ms; 0 botões da toolbar re-renderizados quando o estado ativo não muda; criação < 100 ms; sem vazamento em criar/destruir 100×; bundle por entry point com `size-limit` (meta: menor que os ≈ 186 kB transferidos do modelo).
- **R5.** `@defer` para modais, busca, menu `/`, detalhes da imagem, HTML bruto; `import()` das extensões pesadas e das linguagens de código.

### 6.2 UI sem Tailwind/design system
- **R6.** Toda a UI (toolbar, bubble menus de texto e de imagem, modais de link/mídia/detalhes da imagem/idioma/autor, menu `/`, busca e substituição, redimensionamento) reescrita em CSS `--rte-*`, em `@layer`, com classes `rte-*` estáveis. Controles internos (botão, campo, checkbox, radio, select) **acessíveis**.
- **R7.** Formulários internos dos modais com **Signal Forms** (URL segura, `alt` obrigatório ou "decorativa", largura mínima, código de idioma).
- **R8.** Bubble menus começam **ocultos** (`visibility:hidden; opacity:0`) (lição 13).
- **R9.** Menus e modais funcionam em telas estreitas e com toque (pointer events); teclado virtual validado na spec 08.

### 6.3 Acessibilidade (WCAG 2.2 AA)
- **R10.** Toolbar `role="toolbar"` com *roving tabindex*; menu `/` como combobox + listbox; foco visível; *focus trap* nos modais; `aria-live` para busca e limites; `contenteditable` com `role="textbox"` e `aria-multiline`; atalhos documentados; `prefers-reduced-motion`; preferir `@angular/aria`, com abstração interna para poder trocar.

### 6.4 SSR
- **R11.** Nada de `document`/`window` em caminhos de servidor; no SSR renderiza o conteúdo/placeholder e cria o `Editor` só no navegador.

### 6.5 Configurabilidade
- **R12.** Toolbar configurável + presets; `features` desligam o recurso **na toolbar, no menu `/` e nas extensões** de uma vez; provedores de embed e adaptador de upload plugáveis; extensões extras e `editorReady`.
- **R13.** Rascunho (`draftKey`) com restauração e aviso ao sair (`beforeunload`), via `DraftStorage` injetável.
- **R14.** Tema: `provideRichText({ theme })` e `[theme]` por instância aplicam variáveis via `style.setProperty` em *host binding* (presentes no HTML do SSR, compatível com CSP); prioridade instância > CSS ancestral > provider > padrão.

### 6.6 API pública
- **R15.** `index.ts` explícito por entry point; **api-extractor** barra quebras acidentais.

## 7. Testes

Unitários (Vitest + TestBed) de componentes, modais, toolbar, i18n, adaptador de upload; **formulários** (schema com `required`/`maxLength`/`disabled`, validadores, `touched`, os 3 modos); suíte **zoneless e com zone.js**; harnesses do Aria para teclado; contadores de render para R4; teste de vazamento. Mapa dos testes do modelo (134) é o piso a portar. E2E em navegador real é a spec 08.

## 8. Critérios de aceite

- [ ] S1 a S4 resolvidos e registrados em ADR; decisões `Editor` direto, ícones SVG internos e `<dialog>`/popover nativos confirmadas (ou revistas) em ADR.
- [ ] Os 3 modos de uso funcionam: `[formField]`, `formControlName`, `[(value)]`.
- [ ] Demo mínima **sem Tailwind** com todos os recursos do plano 2.1.
- [ ] Suíte verde zoneless e com zone.js; contrato editor ↔ esquema ↔ sanitizador verde.
- [ ] Orçamentos do R4 atendidos (ou ajustados com dados em ADR); axe sem violações sérias.
- [ ] Nenhuma string fixa fora de `RTE_LABELS`; pt-BR, en e es completos.
- [ ] `api-extractor` sem diferenças; `attw`/`publint` verdes.

## 9. Marcos sugeridos para o plano de implementação

1. Spikes S1/S2 + ADRs · 2. Casca do componente + ponte de signals + 3 modos de formulário · 3. Toolbar configurável + Aria + estilos/tema · 4. Modais, bubble menus, menu `/`, busca (Signal Forms internos, `@defer`) · 5. Upload, mídia, redimensionamento, rascunho · 6. i18n + validadores · 7. SSR, desempenho e fechamento da API.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| `FormValueControl` e CVA não coexistirem | Plano B do S1: dois componentes finos sobre o mesmo núcleo |
| Nomes/contratos de Signal Forms/Aria diferem do esboço | Reconfirmar na documentação; só `@publicApi`; ADR |
| `@angular/aria` ainda em *preview* | Abstração interna para trocar |
| Metas de desempenho eram hipóteses | S3 mede antes de congelar |
