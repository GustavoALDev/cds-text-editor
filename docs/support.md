# Suporte e depreciação

## Versionamento

Semver, com os cinco pacotes (`core`, `sanitizer`, `theme`, `angular`, `render`) **versionados juntos**: o Changesets os trata como um grupo `fixed`, todos saem na mesma versão e as dependências internas entre eles são exatas. Por isso um `minor` ou `major` de um pacote leva os outros cinco à mesma versão.

- Em `0.x`, uma quebra sai em `minor`, com nota de migração no changeset.
- A partir da `1.0.0`, quebra só em `major`.
- Nome do pacote, canal e `dist-tag` de publicação: `TODO-AUTOR` (decisão do dono, spec 09b). Nada foi publicado ainda.

## API pública

São públicos, e sujeitos ao semver:

1. os relatórios de API em `packages/*/api/*.api.md` (todos os `exports` de cada pacote, tipos incluídos);
2. a superfície CSS pública em `packages/*/api/*.css-api.md` (itens marcados `public` na lista `css-public.json` do pacote: as variáveis `--rte-*` dos níveis 1 a 3 do tema, `.rte-root` e as classes que o guia ensina a mirar);
3. o **esquema do HTML gravado**, contrato em [html-schema.md](html-schema.md) (gerado do esquema e conferido por teste): remover elemento, atributo ou classe `rt-*`, ou mudar a forma canônica de modo que conteúdo gravado deixe de abrir igual, é quebra;
4. os seletores, entradas e saídas dos componentes e diretivas (`rte-editor`, `[rteContent]`, `rte-toc`, `rte-editor[rte*]`).

**Não** são públicos, e podem mudar em qualquer versão:

- itens marcados `@internal` e com prefixo `ɵ`, mesmo que importáveis, e os estáticos `ɵcmp`/`ɵfac`/`ɵdir`;
- caminhos fora do `exports` de cada pacote;
- classes CSS e variáveis fora da lista pública (`css-public.json`);
- nomes de _chunk_ e o texto dos rótulos padrão;
- o HTML interno do editor (DOM do ProseMirror).

### Convenção de nomes

Tipos, interfaces, classes, _tokens_ e constantes exportados começam por `Rte`/`RTE_`. Opções de uma função se chamam `Rte<Coisa>Options`. Funções puras ficam sem prefixo (`slugify`, `toEmbed`, `createSanitizer`), exceto as de _provider_ do Angular, que seguem `provideRte<Pacote>` (`provideRichText` foi mantida por decisão do dono). Um teste das ferramentas confere o prefixo nos relatórios.

### Itens internos exportados

Alguns itens `@internal` continuam exportados porque os _chunks_ `@defer` e o rollup do ng-packagr precisam deles (por exemplo `RteDialogController`, `RteToolbarState`, `RteFloatingMenusApi` e as classes-base `RteTextValidator`/`RteCountValidator`). Não se usa `stripInternal`: tirá-los do `.d.ts` quebraria a checagem de _templates_ no projeto do consumidor, que lê os estáticos `ɵcmp`. Eles estão **fora do contrato** (as diretivas de validação do `/validators` não são feitas para herança). Não há camada `@beta`/`@experimental`: o que não puder ser prometido é `@internal` ou não existe.

Reexportações intencionais, estas sim públicas: `clearLocalDrafts` no `.` do `angular`, `RTE_LABELS_EN` no `/i18n` e `RteTocEntry` no `/toc` do `render`.

## Depreciação

- Em `0.x`: a quebra sai em `minor`, com nota de migração no changeset.
- A partir da `1.0`: uma API pública é marcada `@deprecated`, com a alternativa e a versão prevista de remoção, e mantida por **ao menos um `minor`** e até o próximo `major`. A remoção só acontece em `major`, listada no changeset e na página de migração do guia.
- O CSS e o esquema seguem a mesma regra: classe ou variável pública, ou elemento do esquema, fica até o `major`. O esquema **nunca deixa de ler** conteúdo gravado por versão anterior (leitura tolerante).

## Terceiros

Alguns tipos de terceiros aparecem na API pública. Isso é aceito e declarado aqui:

- **Tiptap 3** (`^3.31.4`): `Editor` em `RteEditor.editor`, `editorReady` e `getRteEditor`; `AnyExtension` e `ChainedCommands` em `/extensions`; `Node` do `@tiptap/pm`. As escotilhas para o `Editor` são o **contrato do Tiptap 3, não da lib**.
- **`highlight.js`**: `LanguageFn`.
- **Angular**: `Signal`, `InputSignal`, `EnvironmentProviders`, `Provider`, `SafeHtml` e tipos de `@angular/forms` e `@angular/forms/signals`. Na documentação do Angular 22 (conferida em 2026-10-09), as APIs de Signal Forms estão `@publicApi 22.0`, estáveis; só a integração WebMCP é experimental e a lib não a usa. Logo, o `/validators` não declara exceção. Se uma versão futura do Angular marcar como não estável algo que a lib use, a exceção passa a valer para esse item, e uma quebra dele pode exigir mudança em `minor` com nota de migração.

Regras:

- Subir o `major` de um deles (Tiptap 4, `highlight.js` 12) é `major` da lib.
- A faixa dos _peers_ só **alarga** em `minor`.

## Angular

- `peerDependencies` `@angular/*` em `>=22.2.1 <23` em `angular` e `render` (o piso vem do `FormValueControl`).
- **Minors do 22**: cobertos pela matriz de compatibilidade (piso e último; `next` não bloqueante). Quebra num `minor` do Angular vira correção em `patch`.
- **Angular 23**: previsto para ~nov/2026 (calendário semestral do Angular; conferir). A perna `next` da matriz acompanha o RC. Quando a suíte inteira passar no 23 **sem** mudança de código, um `minor` da lib alarga para `>=22.2.1 <24`; se exigir mudança incompatível com o 22, a lib sai em `major`.
- A `1.0` **não espera** o Angular 23.
- Largar o Angular 22 só em `major` da lib e não antes do fim do LTS do Angular 22.

## Versões suportadas

Ver [SECURITY.md](../SECURITY.md).
