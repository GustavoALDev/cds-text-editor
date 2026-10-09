# cds-text-editor

Editor de texto rico para **Angular 22+**, construído sobre o **Tiptap 3**, publicado como um conjunto de pacotes independentes sob licença MIT.

> **Status: em construção.** Os cinco pacotes estão implementados (spec 05 fechada no ADR 0016) e sem versão publicada; a confirmação nos três navegadores é a rodada do CI. A superfície pública de cada entry está congelada em relatórios `packages/*/api/*.api.md` (alvo `api`).

Este projeto **não é afiliado** à Tiptap nem ao ProseMirror.

## Início rápido

Os pacotes ainda não foram publicados e o nome `@cds/*` é provisório (`TODO-AUTOR`); o comando abaixo é o gerado do mesmo ponto que o site usa. O texto abaixo vem dos exemplos compilados do Início rápido do guia: nada é copiado à mão.

### 1. Instale

<!-- readme: generated install-command -->
```bash
npm install @cds/rte-angular \
  @tiptap/core@^3.31.4 \
  @tiptap/extension-blockquote@^3.31.4 \
  @tiptap/extension-bold@^3.31.4 \
  @tiptap/extension-code-block@^3.31.4 \
  @tiptap/extension-code@^3.31.4 \
  @tiptap/extension-document@^3.31.4 \
  @tiptap/extension-hard-break@^3.31.4 \
  @tiptap/extension-heading@^3.31.4 \
  @tiptap/extension-horizontal-rule@^3.31.4 \
  @tiptap/extension-italic@^3.31.4 \
  @tiptap/extension-link@^3.31.4 \
  @tiptap/extension-list@^3.31.4 \
  @tiptap/extension-paragraph@^3.31.4 \
  @tiptap/extension-strike@^3.31.4 \
  @tiptap/extension-subscript@^3.31.4 \
  @tiptap/extension-superscript@^3.31.4 \
  @tiptap/extension-table@^3.31.4 \
  @tiptap/extension-text-align@^3.31.4 \
  @tiptap/extension-text@^3.31.4 \
  @tiptap/extension-underline@^3.31.4 \
  @tiptap/extensions@^3.31.4 \
  @tiptap/pm@^3.31.4 \
  highlight.js@^11.11.1 \
  lowlight@^3.3.0
```
<!-- /readme -->

### 2. Configure os rótulos

<!-- readme: example examples/inicio-rapido/app.config.ts#config -->
```ts
import type { ApplicationConfig } from '@angular/core';
import { provideRichText } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';

export const appConfig: ApplicationConfig = {
  providers: [provideRichText({ labels: RTE_LABELS_PT_BR })],
};
```
<!-- /readme -->

### 3. Use o editor em um formulário

<!-- readme: example examples/inicio-rapido/form-example.ts#component -->
```ts
import { Component, computed, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { RteEditor } from '@cds/rte-angular';
import { RTE_LABELS_PT_BR } from '@cds/rte-angular/i18n';
import {
  formatRteError,
  isRteValidationError,
  rteMaxChars,
} from '@cds/rte-angular/validators';
import { DisplayExample } from './display-example';

@Component({
  selector: 'docs-form-example',
  imports: [RteEditor, FormField, DisplayExample],
  templateUrl: './form-example.html',
})
export class FormExample {
  protected readonly model = signal({
    body: '<p>Olá, <strong>mundo</strong>!</p>',
  });

  // O limite mede o texto que a pessoa vê, não a string HTML.
  protected readonly post = form(this.model, (path) => {
    rteMaxChars(path.body, 60);
  });

  protected readonly errors = computed(() =>
    this.post
      .body()
      .errors()
      .filter(isRteValidationError)
      .map((error) => formatRteError(error, RTE_LABELS_PT_BR)),
  );

  // O editor barra a digitação no limite; um valor vindo de fora (API, rascunho) pode passar dele.
  protected fillTooLong(): void {
    this.model.set({ body: `<p>${'texto '.repeat(20)}</p>` });
  }
}
```
<!-- /readme -->

<!-- readme: example examples/inicio-rapido/form-example.html#template -->
```html
<rte-editor [formField]="post.body" ariaLabel="Texto do artigo" />
<p aria-live="polite" data-testid="erros">{{ errors().join(' ') }}</p>
<button type="button" (click)="fillTooLong()">Preencher acima do limite</button>
<docs-display-example [html]="model().body" />
```
<!-- /readme -->

### 4. Exiba o texto

<!-- readme: example examples/inicio-rapido/display-example.ts#display -->
```ts
import { Component, input } from '@angular/core';
import { provideRteRender, RteContent } from '@cds/rte-render';
import { createSanitizer } from '@cds/rte-sanitizer';

@Component({
  selector: 'docs-display-example',
  imports: [RteContent],
  providers: [provideRteRender({ sanitize: createSanitizer() })],
  template: `<article [rteContent]="html()"></article>`,
})
export class DisplayExample {
  readonly html = input.required<string>();
}
```
<!-- /readme -->

O guia continua em [Configuração](apps/docs/content/guia/configuracao.md): CSS, formulários, envio de mídia, segurança, SSR e CSP.

## Guia, demo e servidor de exemplo

- **Site do guia e referência de API:** `TODO-AUTOR` (URL do GitHub Pages, ainda não publicado: `https://TODO-AUTOR.github.io/cds-text-editor/`). Enquanto o site não estiver publicado, o mesmo conteúdo está em [`apps/docs/content/guia/`](apps/docs/content/guia/inicio-rapido.md).
- **Demo** (playground do tema, formulários, barra e idiomas): [`apps/demo`](apps/demo), publicada junto do site em `demo/`.
- **Servidor de exemplo de upload:** [`examples/server-node`](examples/server-node/README.md). **É uma referência, não um produto**: mostra o contrato do `httpUploadAdapter` e as defesas mínimas de um endpoint de upload; não o publique como está.

## Pacotes

Os nomes `@cds/rte-*` são provisórios (ver [ADR 0001](docs/decisions/0001-escopo-nome-versoes-e-ferramentas.md)).

| Pacote                                     | Estado                                                | Descrição                                       |
| ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------- |
| [`@cds/rte-core`](packages/core)           | implementado; API em [`api/`](packages/core/api)      | Extensões Tiptap, utilitários e esquema do HTML |
| [`@cds/rte-sanitizer`](packages/sanitizer) | implementado; API em [`api/`](packages/sanitizer/api) | Sanitização do HTML                             |
| [`@cds/rte-theme`](packages/theme)         | implementado; API em [`api/`](packages/theme/api)     | Tema (CSS e tokens)                             |
| [`@cds/rte-angular`](packages/angular)     | implementado; API em [`api/`](packages/angular/api)   | Componente Angular do editor                    |
| [`@cds/rte-render`](packages/render)       | implementado; API em [`api/`](packages/render/api)    | Renderização do HTML                            |

## Navegadores

Política **sempre atualizada**: o suporte declarado é o das versões abaixo, e só se promete o que se testa. Fonte única; o guia de uso aponta para esta tabela. Spec 08b (O10), [ADR 0021](docs/decisions/0021-visual-movel-e-leitores-de-tela.md).

| Navegador | Faixa suportada | Como é verificado |
| --- | --- | --- |
| Chrome e Edge (desktop) | as duas últimas versões estáveis | Chromium do Playwright no Linux (E2E, visual, desempenho) |
| Firefox (desktop) | a última estável e a ESR corrente | Firefox do Playwright no Linux (E2E e visual) |
| Safari (macOS) | a última versão e a anterior | WebKit do Playwright no Linux; Safari real só pelo [roteiro manual](docs/quality/roteiro-leitor-de-tela.md) |
| Safari (iOS) | a última versão e a anterior | WebKit com o descritor do iPhone no Playwright (**não é** o Safari do iOS); aparelho real só pelo roteiro manual |
| Chrome (Android) | a última versão estável | Chromium com o descritor do Pixel 7 no Playwright; aparelho real só pelo roteiro manual |

As versões exatas dos motores de cada execução ficam no resumo do job `verify` e no artefato `quality-reports` (`e2e/test-results/browsers/`). Motores antigos estão **fora da política** (sem verificação, sem promessa). Leitores de tela: as combinações obrigatórias estão no [roteiro](docs/quality/roteiro-leitor-de-tela.md) (execução do dono, antes da 1.0).

**Recursos que impõem piso** (versão mínima **informativa**: o recurso existe a partir dela e o pacote "pode funcionar" ali, mas só a faixa acima é suportada). Fonte: MDN browser-compat-data 8.1.5, consultado em 2026-10-08.

| Recurso (uso no pacote) | Chrome/Edge | Firefox | Safari (macOS/iOS) |
| --- | --- | --- | --- |
| `popover` e `showPopover()` (menus da barra, menus flutuantes, lista do `/`) | 114 | 125 | 17 (iOS 17; atributo no iOS 18.3) |
| `<dialog>` e `showModal()` (diálogos) | 37 (Edge 79) | 98 | 15.4 |
| `light-dark()` (tema claro/escuro) | 123 | 120 | 17.5 |
| `@property` (tokens do tema) | 85 | 128 | 16.4 |
| Sintaxe de cor relativa (`oklch(from …)`); sem ela vale o plano B em TypeScript ([ADR 0002](docs/decisions/0002-tema-cores-padrao-e-navegadores.md)) | 122 | 128 | 18 |
| `color-mix()` | 111 | 113 | 16.2 |
| `@layer` | 99 | 97 | 15.4 |
| Unidades `dvh` (diálogos e menus em telas móveis) | 108 | 101 | 15.4 |
| `window.visualViewport` (posição dos menus com teclado virtual e zoom) | 61 (Edge 79) | 91 | 13 |
| `prefers-contrast` e `forced-colors` | 96 / 89 | 101 / 89 | 14.1 / 16 |

Notas: o WebKit móvel do Playwright não é o Safari do iOS (sem teclado real nem alças de seleção); o teclado virtual, a autocorreção e a composição só se provam no aparelho (roteiro, seção "Seção móvel real"). O atributo `popover` no iOS só aparece como API a partir do 18.3 na tabela de compatibilidade, embora o recurso funcione desde o 17. Divergências entre motores registradas nos ADR [0019](docs/decisions/0019-matriz-de-versoes-e-relatorios.md) e 0021 (J8 por cookie de CSRF e `SameSite` em `127.0.0.1`, `Range` no WebKit; menu da tabela pelo recuo previsto da M9).

## Especificações

O projeto é guiado por specs em [`docs/specs`](docs/specs) (índice em [`docs/specs/README.md`](docs/specs/README.md)). Decisões de arquitetura ficam em [`docs/decisions`](docs/decisions).

## Desenvolvimento

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Segurança: [SECURITY.md](SECURITY.md). Licença: [MIT](LICENSE).

> Projeto independente, **não afiliado à Tiptap nem ao ProseMirror**.
