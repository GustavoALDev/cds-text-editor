// Documento do cenário completo de desempenho (spec 05d2, Z1; N45 e N46).

export const PERF_PARAGRAPHS = 2000;
/** Parágrafo (base 1) onde o cursor fica nas medidas por tecla. */
export const PERF_TARGET_PARAGRAPH = 1000;
/** Ocorrências de "banana" (a consulta "ativa" de ~50 resultados). */
export const PERF_BANANAS = 50;

const WORDS =
  'palavra palavra palavra palavra palavra palavra palavra palavra palavra palavra';

const TABLE =
  '<table><tbody><tr><th scope="col"><p>Nome</p></th><th scope="col"><p>Valor</p></th></tr>' +
  '<tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>';

/** Imagem de mesma origem (`/e2e.png`), sem rede: o cenário mede o editor, não a decodificação. */
const image = (n: number) =>
  `<figure class="rt-figure rt-figure--center"><img src="/e2e.png?i${n}" alt="Imagem ${n}" loading="lazy" decoding="async"></figure>`;

/**
 * 2000 parágrafos × 10 palavras (20 mil), 1 tabela, 1 link e 20 imagens; 50
 * parágrafos (de 40 em 40, nunca o 1000) trocam a última palavra por
 * "banana". Com `small`, só 20 parágrafos (N46: documento pequeno).
 */
export function perfDocument(options: { small?: boolean } = {}): string {
  const count = options.small ? 20 : PERF_PARAGRAPHS;
  const parts: string[] = [];
  let images = 0;
  for (let i = 1; i <= count; i++) {
    if (!options.small && i % 40 === 7) {
      parts.push(`<p>${WORDS.replace(/palavra$/, 'banana')}</p>`);
    } else if (i === 2) {
      parts.push(
        `<p><a href="https://example.com/">${WORDS.split(' ').slice(0, 2).join(' ')}</a> ${WORDS.split(' ').slice(2).join(' ')}</p>`,
      );
    } else {
      parts.push(`<p>${WORDS}</p>`);
    }
    if (i === 10) parts.push(TABLE);
    if (images < 20 && i % (options.small ? 1 : 100) === 0) {
      parts.push(image(++images));
    }
  }
  return parts.join('');
}
