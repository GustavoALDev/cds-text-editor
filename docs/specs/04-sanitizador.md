# Spec 04 — Sanitizador (`@cds/rte-sanitizer`)

> Depende da spec 03a (esquema). **Atualização (2026-10-03):** opções e regras ajustadas ao esquema declarativo da 03a; o modelo foi perdido e os testes são escritos de novo. Referência: plano seções 2.2, 4.2, 8 (Fase 2) e 13. Modelo (MyPresentation): `apps/back-end/src/common/sanitize/` (`sanitize-rich-text.ts`, `reading-time.ts`, specs, `fixtures/editor-output.html`).

## 1. Objetivo

`sanitizeRichText` isomórfico (Node e navegador) cuja **allowlist é derivada do esquema do core**, com suíte de segurança. Princípio 1 do plano: **seguro por padrão**.

## 2. Fora de escopo

Middleware/exemplos de servidor (spec 07); pipe de exibição (spec 06).

## 3. Decisão: duas engines atrás da mesma API (decidido)

Medido em 2026-10-02 (esbuild para navegador; Node sobre doc de ~400 kB do fixture do editor):

| | `sanitize-html` 2.18 (MIT) | `DOMPurify` 3.4 (MPL-2.0 ou Apache-2.0) |
|---|---|---|
| Navegador, min / gzip | 158 kB / 58 kB | **30 kB / 11,6 kB** |
| Node, 400 kB | **34 ms** | 186 ms (com jsdom; sem allowlist, comparação aproximada) |
| DOM | não precisa | precisa; no servidor exige jsdom (8,5 MB) |

**Decisão:** **`sanitize-html` no servidor/Node** e **`DOMPurify` no navegador** (o pipe de exibição da spec 06 usa o DOMPurify no navegador; o SSR do Angular roda em Node e, por isso, usa o `sanitize-html`), **sob a mesma API `sanitizeRichText`** e a **mesma suíte** (contrato, XSS, propriedade). Motivos: no navegador o DOMPurify usa o parser do próprio navegador (menos risco de mXSS) e é ~5× menor; no servidor o `sanitize-html` é mais rápido, não exige DOM e já está validado no modelo (80 testes).

- Seleção por **entry points condicionais** em `exports` (`node` × `browser`/`default`), sem o consumidor escolher.
- Ao usar DOMPurify (Apache-2.0), manter o aviso de licença em `THIRD-PARTY-NOTICES.md`.
- **Regra de segurança:** a sanitização que vale é a **do servidor, na gravação**; a do navegador é segunda barreira na exibição.
- **Reavaliação:** se a suíte mostrar divergências que não se resolvam na configuração, voltar a **uma engine só** (`sanitize-html`) e registrar em ADR.

## 4. API

```ts
sanitizeRichText(html: string, options?: {
  schema?: RteHtmlSchema;            // padrão: getHtmlSchema(); provedores de embed, hosts de mídia,
                                     // política de links etc. entram pelas opções do getHtmlSchema (spec 03a)
  maxInputLength?: number;           // padrão: definido na implementação
  maxDepth?: number;
}): string
// Reexportados do core (spec 03a), uma só implementação:
htmlToText(html: string): string     // @cds/rte-core/html
countWords(text: string): number
readingTime(text: string, options?): number
```

## 5. Requisitos

- **R1.** A allowlist (tags, atributos, classes, estilos, esquemas de URL, hosts de iframe) vem **só do esquema**; nenhuma lista própria.
- **R2.** Comportamento definido pelo esquema da spec 03a: `rel`/`lang`/`id` validados, remoção de `iframe`/`video`/`img` que ficou sem `src` válido, `a` sem `target` não vira `_blank`, estilos limitados aos **declarados no esquema** (`color`/`background-color` regenerados pelo nome da paleta, `text-align`, `width` de `col`, `aspect-ratio` de `iframe`), interpretados pelas funções do core (`isAllowedUrl`, `sanitizeStyle`, `serializeTokens`, `matchesRule`). Sem `hljs-*` (spec 03a, 4.4).
- **R3.** **Idempotência:** `sanitize(sanitize(x)) === sanitize(x)`.
- **R4.** Limites: entrada acima de `maxInputLength` ou profundidade acima de `maxDepth` → erro tipado ou truncamento documentado (decidir e testar), nunca travar.
- **R5.** Isomórfico: mesmo resultado em Node e em Chromium/Firefox/WebKit para o fixture do contrato.
- **R6.** Sem acesso a `window`/`document` no topo do módulo.
- **R7.** `htmlToText`, `countWords` e `readingTime` são os do core, reexportados (uma só implementação).

## 6. Testes

- **Contrato:** o fixture "todos os recursos" da spec 03 atravessa o sanitizador **sem perda** (já pegou 2 bugs no modelo).
- **XSS:** payloads conhecidos (OWASP cheat sheet), **mXSS**, `srcset`, `style`, `svg`, `math`, `data:`, `javascript:`, entidades codificadas, `<base>`, `<form>`, atributos `on*`, `iframe` com host fora da allowlist.
- **Propriedade (`fast-check`):** para HTML arbitrário gerado, a saída **nunca** contém `<script`, atributo `on*`, `javascript:` nem `data:` em URL.
- **Desempenho:** documento de 20 mil palavras sanitizado dentro de orçamento definido após o benchmark.
- Cobertura: o modelo tinha 80 testes de back-end (sanitização incluída); a suíte nova deve ser **no mínimo equivalente** em casos de XSS.

## 7. Critérios de aceite

- [ ] Suíte de segurança e de contrato verdes em Node e nos 3 navegadores.
- [ ] ADR com os números acima reconfirmados (benchmark reexecutado no workspace novo) e a regra de entry points por ambiente.
- [ ] Propriedade "nunca executável" verde com ≥ 10 mil casos aleatórios.
- [ ] `docs/security.md` com **modelo de ameaças** (o que protege, o que não protege, hipóteses sobre o servidor).
- [ ] Tamanho do pacote para navegador medido e dentro do orçamento definido.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| As duas engines divergirem em casos de borda | Mesma suíte nas duas (item 3); reavaliação para uma engine só, se necessário |
| Esquema permissivo demais abrir XSS por combinação de atributos | Casos de XSS por **recurso**, não só globais |
| Falsa sensação de segurança no cliente | Documentar: a sanitização que vale é a **do servidor** |
