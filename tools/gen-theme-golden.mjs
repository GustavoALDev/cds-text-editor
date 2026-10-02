/**
 * Gera packages/theme/src/__fixtures__/spike-golden.json a partir do spike T6
 * (docs/specs/referencias/t6-tema/theme-fallback.mjs), a verdade independente do plano B.
 *
 * ATENÇÃO: o spike tem um erro de digitação conhecido na linha "m" de `linearToOklab`
 * (0.0883024619 * b, quando o coeficiente padrão do OKLab é 0.1073969566). Como docs/specs
 * não deve ser editado, este script lê o spike como texto, aplica em memória a correção desse
 * único coeficiente (exigindo exatamente uma ocorrência), grava a cópia corrigida em
 * $HOME/.cache/tmp e a importa de lá. O golden é, portanto, "matemática do spike + typo corrigido".
 *
 * Uso: node tools/gen-theme-golden.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BAD = '0.2119034982 * r + 0.6806995451 * g + 0.0883024619 * b';
const GOOD = '0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b';

/** Aplica a correção do coeficiente; lança se a ocorrência não for única. */
export function applyOklabFix(source) {
  const count = source.split(BAD).length - 1;
  if (count !== 1) {
    throw new Error(
      `Correção do spike: esperada 1 ocorrência do coeficiente errado, encontradas ${count}.`,
    );
  }
  return source.replace(BAD, () => GOOD);
}

export const SEEDS = [
  '#8514f5',
  '#f637e3',
  '#0546ff',
  '#000000',
  '#ffffff',
  '#808080',
  '#777777',
  '#767676',
  '#ffff00',
  '#ffffe0',
  '#00ffff',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#7f7f7f',
  '#1db954',
  '#635bff',
  '#ff9900',
  '#fcd34d',
  '#111827',
  '#f9fafb',
  '#10b981',
  '#e11d48',
  '#4f46e5',
  '#0ea5e9',
  '#84cc16',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#6b7280',
];

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const spike = join(root, 'docs/specs/referencias/t6-tema/theme-fallback.mjs');
  let patched;
  try {
    patched = applyOklabFix(readFileSync(spike, 'utf8'));
  } catch (e) {
    console.error(`Erro: ${e.message}`);
    process.exit(1);
  }
  const tmp = join(process.env.TMPDIR ?? join(homedir(), '.cache/tmp'));
  mkdirSync(tmp, { recursive: true });
  const copy = join(tmp, 'theme-fallback.fixed.mjs');
  writeFileSync(copy, patched);
  console.log('Correção do coeficiente OKLab aplicada (1 ocorrência).');
  const { createRteTheme } = await import(pathToFileURL(copy).href);

  const golden = [];
  for (const seed of SEEDS) {
    for (const mode of ['light', 'dark']) {
      for (const neutralTint of [1, 0]) {
        const { hex } = createRteTheme({
          primary: seed,
          secondary: seed,
          tertiary: seed,
          mode,
          neutralTint,
        });
        golden.push({ seed, mode, neutralTint, hex });
      }
    }
  }
  const out = join(root, 'packages/theme/src/__fixtures__/spike-golden.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(golden, null, 2) + '\n');
  console.log(`Golden gravado: ${golden.length} casos em ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
