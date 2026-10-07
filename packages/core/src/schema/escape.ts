// Escapes do algoritmo de serialização do HTML (spec 04, S13), compartilhados
// pelo editor (`extensions/src/string-dom.ts`) e pelo sanitizador, para que os
// dois produzam os mesmos bytes.

const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/**
 * Pré-processamento da entrada do HTML (WHATWG 13.2.3.5) já na escrita: CR e
 * CRLF viram LF e NUL vira U+FFFD, como a releitura faria. Sem isso a saída
 * não seria ponto fixo (o CR de um bloco de código voltaria como LF).
 */
function preprocess(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\0/g, REPLACEMENT_CHAR);
}

/** Escapa texto: `&`, NBSP, `<` e `>`, depois de normalizar CR e NUL. */
export function escapeHtmlText(text: string): string {
  return preprocess(text)
    .replace(/&/g, '&amp;')
    .replace(/\u00a0/g, '&nbsp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escapa o valor de um atributo escrito entre aspas duplas: `&`, NBSP, `"`,
 * `<` e `>`, depois de normalizar CR e NUL.
 */
export function escapeHtmlAttribute(value: string): string {
  return preprocess(value)
    .replace(/&/g, '&amp;')
    .replace(/\u00a0/g, '&nbsp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
