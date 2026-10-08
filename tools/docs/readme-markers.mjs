// Marcadores do README raiz (spec 07d, L6): o miolo entre
//   <!-- readme: example <caminho>#<região> -->   e   <!-- /readme -->
//   <!-- readme: generated install-command -->    e   <!-- /readme -->
// é preenchido pelas MESMAS regiões dos exemplos compilados e pelo mesmo gerador do comando de
// instalação do site: nenhuma cópia manual. Funções puras; quem lê arquivos injeta `resolve`.
//   resolve(kind, arg) -> { code, lang }   (kind: 'example' | 'generated')
// Sem a variável UPDATE_README o chamador compara (`checkReadme`) e falha com a diferença.

const OPEN = /^\s*<!--\s*readme:\s*(example|generated)\s+(.*?)\s*-->\s*$/;
const ANY_OPEN = /^\s*<!--\s*readme:/;
const CLOSE = /^\s*<!--\s*\/readme\s*-->\s*$/;

function fenced(code, lang) {
  const ticks = Math.max(
    3,
    ...[...code.matchAll(/`{3,}/g)].map((m) => m[0].length + 1),
  );
  const bar = '`'.repeat(ticks);
  return `${bar}${lang}\n${code}\n${bar}`;
}

/** Reescreve o miolo de cada par de marcadores; o texto fora deles nunca é tocado. */
export function fillReadme(text, resolve, file = 'README.md') {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CLOSE.test(line))
      throw new Error(
        `${file}:${i + 1}: <!-- /readme --> sem <!-- readme: ... --> correspondente`,
      );
    if (!ANY_OPEN.test(line)) {
      out.push(line);
      continue;
    }
    const open = OPEN.exec(line);
    if (!open)
      throw new Error(
        `${file}:${i + 1}: marcador inválido; use <!-- readme: example caminho#região --> ou <!-- readme: generated install-command -->`,
      );
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (CLOSE.test(lines[j])) {
        end = j;
        break;
      }
      if (ANY_OPEN.test(lines[j]))
        throw new Error(
          `${file}:${j + 1}: marcador aninhado: o <!-- readme: ... --> da linha ${i + 1} não foi fechado com <!-- /readme -->`,
        );
    }
    if (end < 0)
      throw new Error(
        `${file}:${i + 1}: o marcador <!-- readme: ${open[1]} ${open[2]} --> não foi fechado com <!-- /readme -->`,
      );
    let resolved;
    try {
      resolved = resolve(open[1], open[2]);
    } catch (e) {
      throw new Error(`${file}:${i + 1}: ${e.message}`);
    }
    out.push(
      line,
      ...fenced(resolved.code, resolved.lang).split('\n'),
      lines[end],
    );
    i = end;
  }
  return out.join(eol);
}

/** Compara o README com o preenchido: `{ ok, filled, diff }` (diff em pt-BR, ou `null`). */
export function checkReadme(text, resolve, file = 'README.md') {
  const filled = fillReadme(text, resolve, file);
  if (filled === text) return { ok: true, filled, diff: null };
  const a = text.replace(/\r\n/g, '\n').split('\n');
  const b = filled.replace(/\r\n/g, '\n').split('\n');
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  const show = (l) => (l === undefined ? '(fim do arquivo)' : JSON.stringify(l));
  return {
    ok: false,
    filled,
    diff:
      `${file}:${k + 1}: o conteúdo gerado difere do arquivo\n` +
      `  esperado: ${show(b[k])}\n` +
      `  atual:    ${show(a[k])}\n` +
      '  rode UPDATE_README=1 node tools/docs-content.mjs para reescrever',
  };
}
