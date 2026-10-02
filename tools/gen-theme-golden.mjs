/**
 * Gera packages/theme/src/__fixtures__/spike-golden.json a partir do spike T6
 * (docs/specs/referencias/t6-tema/theme-fallback.mjs), a verdade independente do plano B.
 *
 * ATENÇÃO: o spike tem dois defeitos conhecidos. (1) Erro de digitação na linha "m" de
 * `linearToOklab` (0.0883024619 * b; o coeficiente padrão do OKLab é 0.1073969566). (2) O degrau
 * `clamp((WHITE_Y - y) * 1000)` é uma rampa de 0,001 de largura (~35 mil cores sRGB com texto
 * cinza); o ganho passa a 1e9. Como docs/specs não deve ser editado, este script lê o spike como
 * texto, aplica em memória as duas correções (exigindo exatamente uma ocorrência de cada), grava a cópia corrigida em
 * $HOME/.cache/tmp e a importa de lá. O golden é, portanto, "matemática do spike + correções".
 *
 * Uso: node tools/gen-theme-golden.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIXES = [
  {
    // Coeficiente OKLab errado na linha "m" de linearToOklab.
    bad: '0.2119034982 * r + 0.6806995451 * g + 0.0883024619 * b',
    good: '0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b',
    name: 'coeficiente OKLab',
  },
  {
    // A rampa de 0,001 de largura deixava ~35 mil cores sRGB com texto cinza: degrau praticamente exato.
    bad: 'const s = clamp((WHITE_Y - y) * 1000);',
    good: 'const s = clamp((WHITE_Y - y) * 1e9);',
    name: 'ganho do degrau',
  },
];

function applyFix({ bad, good, name }, source) {
  const count = source.split(bad).length - 1;
  if (count !== 1) {
    throw new Error(
      `Correção do spike (${name}): esperada 1 ocorrência, encontradas ${count}.`,
    );
  }
  return source.replace(bad, () => good);
}

/** Aplica a correção do coeficiente OKLab; lança se a ocorrência não for única. */
export const applyOklabFix = (source) => applyFix(FIXES[0], source);

/** Aplica a correção do ganho do degrau; lança se a ocorrência não for única. */
export const applyStepFix = (source) => applyFix(FIXES[1], source);

/** Aplica todas as correções conhecidas do spike (cada uma exatamente uma vez). */
export const applySpikeFixes = (source) => applyStepFix(applyOklabFix(source));

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
  // Perto do limiar de luminância (0.1791): exemplo da rampa, 8-bit mais próximos de cada lado
  // e cores a menos de 0.0005 abaixo/acima.
  '#e51e3a',
  '#97687b',
  '#1d8811',
  '#0274e0',
  '#03874d',
  '#09882e',
  '#1b7cb2',
  '#03847a',
  '#068836',
  '#0d78cd',
];

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const spike = join(root, 'docs/specs/referencias/t6-tema/theme-fallback.mjs');
  let patched;
  try {
    patched = applySpikeFixes(readFileSync(spike, 'utf8'));
  } catch (e) {
    console.error(`Erro: ${e.message}`);
    process.exit(1);
  }
  const tmp = process.env.TMPDIR ?? join(homedir(), '.cache', 'tmp');
  mkdirSync(tmp, { recursive: true });
  const copy = join(tmp, 'theme-fallback.fixed.mjs');
  writeFileSync(copy, patched);
  console.log(
    'Correções do spike aplicadas (coeficiente OKLab e ganho do degrau, 1 ocorrência cada).',
  );
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
