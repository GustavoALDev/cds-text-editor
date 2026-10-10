---
title: Formulários
description: O editor em Signal Forms, Reactive Forms e Template Forms, com as diretivas de validação de texto, as mensagens de erro, o limite que barra a digitação e o salvamento.
---

# Formulários

O `rte-editor` é um controle de formulário nos três modelos do Angular, e também funciona sem formulário. O valor é sempre **HTML canônico**; um documento vazio vale `''`. Esta página ensina o caminho de cada modelo; as tabelas completas estão no [README do `@comodeviaser/rte-angular`](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md#uso) e na referência [`api/angular-validators`](api/angular-validators).

## Signal Forms (caminho principal)

Com Signal Forms, `[formField]` liga o editor ao campo e as funções `rteRequired`, `rteMaxChars`, `rteSafeLinks` e `rteNoEmptyHeadings` entram no esquema. Elas medem o **texto** que a pessoa vê, não a string HTML. `required`, `disabled`, `readonly`, `hidden`, `invalid`, `touched` e `maxLength` do esquema chegam ao componente sozinhos.

<!-- example: examples/formularios/signal-form.ts#signal -->

O `@ts-expect-error` do exemplo faz parte do build do site: um validador de texto num campo que não é `string` é recusado pelo compilador. Outra recusa vale lembrar: **não** ligue `[disabled]`, `[readonly]` nem `[maxLength]` junto de `[formField]`. O Angular a rejeita com o erro de _template_ NG8022, que o `@ts-expect-error` não alcança; por isso o exemplo errado fica fora do build, ao lado da forma correta acima:

<!-- no-compile: erro de template (NG8022); o @ts-expect-error não alcança template, e a forma correta é o signal-form.ts acima -->

```html
<rte-editor [formField]="post.body" [maxLength]="5000" ariaLabel="Texto" />
```

Em vez disso, ponha o limite no esquema (`rteMaxChars(path.body, 5000)`): ele vira o limite de digitação do editor.

## Reactive Forms e Template Forms

No Angular 22.2 o `NgControl` liga o editor direto, sem `NG_VALUE_ACCESSOR`. O caminho nativo, porém, não lê `NG_VALIDATORS`: por isso as validações de texto vêm de `RteValidators` (Reactive) ou das diretivas `rteRequired`, `[rteMaxChars]`, `[rteMaxWords]`, `rteSafeLinks` e `rteNoEmptyHeadings` (Template e Reactive), importadas do entry `/validators`.

Template Forms, com todas as diretivas:

<!-- example: examples/formularios/template-form.html#template -->

<!-- example: examples/formularios/template-form.ts#component -->

Reactive Forms, com `RteValidators`:

<!-- example: examples/formularios/reactive-form.html#template -->

<!-- example: examples/formularios/reactive-form.ts#component -->

### O limite do validador não chega ao editor

No caminho nativo não existem os metadados de Signal Forms, então o **limite do validador não chega ao componente**: ele só marca o formulário como inválido. Para o limite também **barrar a digitação**, ligue `[maxLength]` no elemento, como nos exemplos acima (`[maxLength]="max"`). Só a entrada direta é barrada; um valor que chega de fora (API, rascunho) acima do limite fica inválido, sem corte. O mesmo vale para `[readonly]` e `[hidden]`.

### `rteRequired` não é `required`

O seletor é `rteRequired` (e não `required`) para não colidir com o `required` nativo do Angular, que continua valendo e mede a **string HTML**: um editor vazio pode ter `<p></p>`, e isso engana essa medida. `rteRequired` considera vazio o documento sem texto e sem imagem, vídeo ou _iframe_. Use o `rteRequired`; `[rteRequired]="false"` o desliga.

## Mensagens de erro

O componente não desenha mensagens. Traduza o erro com `formatRteError(error, labels)`, que aceita as três formas de erro (Signal Forms, `ReactiveValidationError` e o `control.errors` de Reactive e Template), nunca lança e devolve `''` para o que não conhece:

<!-- example: examples/formularios/erros.example.ts#mensagem -->

Ligue a mensagem ao editor com `ariaDescribedBy`; `aria-invalid="true"` só aparece com o campo inválido **e** tocado.

## Sem formulário: `[(value)]`

Sem formulário, `[(value)]` liga um _signal_ ao editor. Um cuidado: **devolva ao modelo o que recebeu, ou o valor canônico**. Se o seu código reescreve o valor para um equivalente não canônico, ou o pai devolve o valor anterior antes da detecção de mudanças, o editor trata aquilo como carga externa e perde o cursor e o histórico (comportamento do `model()` do Angular, ADR 0007).

<!-- example: examples/formularios/value-form.ts#component -->

## Salvar e rascunho

`isDirty()` é `true` quando o valor difere da base salva. Depois de gravar no servidor, chame `markSaved(htmlGravado)`: a base passa a ser esse HTML e o rascunho local é apagado. O `draftKey` (opt-in) guarda um rascunho no navegador e oferece restaurá-lo, nunca sozinho; use usuário **e** documento na chave e chame `clearLocalDrafts()` no _logout_. A seção "Rascunho e salvamento" do README trata de `warnOnUnsaved` e do guarda de rota.

<!-- example: examples/formularios/salvar.ts#salvar -->

## Veja funcionando

Cada bloco aceita texto digitado (o limite de 60 caracteres barra a digitação) e os botões preenchem o campo por código, como faria um valor vindo da API: o erro de `rteMaxChars` e o de `rteRequired` aparecem, traduzidos por `formatRteError`.

<!-- live: formularios -->

Próximos passos: [Barra e recursos](guia/barra-e-recursos) e [Idiomas](guia/idiomas). O demo tem os mesmos formulários em uma página: [demo/forms](demo/forms).
