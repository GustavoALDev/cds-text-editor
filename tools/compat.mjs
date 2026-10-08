// Matriz de versões (spec 08a, X2/X3/X5): lê os pisos dos peers publicados, resolve o "último" e o
// `next`, monta as pernas da matriz do CI e as instalações da fase B (fonte). Node puro, sem
// dependências; `npm view`, `npm ls` e o `fs` são injetados nos testes (nenhum teste usa a rede).
// Uso:
//   node tools/compat.mjs legs --set pr|full              # {"include":[Leg...]} em stdout
//   node tools/compat.mjs install --leg <nome>|--leg-json '<json>'   # fase B: instala e prova por npm ls
//   node tools/compat.mjs versions --leg <nome>|--leg-json '<json>' --out <arquivo>   # --versions do consumer.mjs
// Variáveis: RTE_NPM (npm a usar; padrão `npm`, localmente `npx -y npm@11`).
import { spawnSync } from 'node:child_process';
import * as nodeFs from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Decisão do spike (08a T1): a fase B reinstala também o Angular na raiz? `true` = sim (a
 * reinstalação de `@angular/*` convive com o `@nx/angular`); `false` = plano B, fase B só do
 * Tiptap e o Angular último coberto só pela fase A (consumidor). Ver "Notas para o ADR 0019".
 */
export const ANGULAR_PHASE_B = true;

/** Pernas do conjunto `full`, na ordem. `pr` é só a primeira. */
const FULL_LEGS = [
  ['latest', 'latest'],
  ['min', 'latest'],
  ['latest', 'min'],
  ['next', 'latest'],
];

const FRAMEWORK = new Set([
  '@angular/core',
  '@angular/common',
  '@angular/compiler',
  '@angular/compiler-cli',
  '@angular/forms',
  '@angular/platform-browser',
  '@angular/platform-server',
  '@angular/router',
]);
const TOOLING = new Set([
  '@angular/cli',
  '@angular/build',
  '@angular/ssr',
  '@schematics/angular',
]);

/** Família de um pacote: `framework`, `tooling` (segue o `@angular/cli`), `tiptap` ou `null`. */
export function classify(name) {
  if (FRAMEWORK.has(name)) return 'framework';
  if (TOOLING.has(name) || name.startsWith('@angular-devkit/'))
    return 'tooling';
  if (name.startsWith('@tiptap/')) return 'tiptap';
  return null;
}

/** Famílias a partir das `devDependencies` (e `dependencies`) da raiz, por prefixo. */
export function families(rootPkg) {
  const out = { framework: [], tooling: [], tiptap: [] };
  const names = new Set([
    ...Object.keys(rootPkg.dependencies ?? {}),
    ...Object.keys(rootPkg.devDependencies ?? {}),
  ]);
  for (const name of names) {
    const family = classify(name);
    if (family) out[family].push(name);
  }
  return out;
}

const parseVersion = (version) =>
  version.split(/[-+]/)[0].split('.').map(Number);

/** Compara versões `x.y.z` (o sufixo de pré-lançamento é ignorado; só estáveis chegam aqui). */
export function compareVersions(a, b) {
  const [pa, pb] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Piso dos peers publicados (`packages/*` não privados): o maior `X.Y.Z` entre os `@angular/*`
 * e entre os `@tiptap/*`. Aceita `>=X.Y.Z <N`, `^X.Y.Z` e `~X.Y.Z`.
 */
export function readFloors(rootDir, fs = nodeFs) {
  const packagesDir = join(rootDir, 'packages');
  const floors = { angular: null, tiptap: null };
  for (const dir of fs.readdirSync(packagesDir)) {
    const file = join(packagesDir, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pkg.private) continue;
    for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
      const key = name.startsWith('@angular/')
        ? 'angular'
        : name.startsWith('@tiptap/')
          ? 'tiptap'
          : null;
      if (!key) continue;
      const match = /^(?:>=|\^|~)\s*(\d+\.\d+\.\d+)(?:\s|$)/.exec(range.trim());
      if (!match) {
        throw new Error(
          `peer ${name} em ${pkg.name ?? dir}: "${range}" não casa com o formato do piso (>=X.Y.Z, ^X.Y.Z ou ~X.Y.Z)`,
        );
      }
      if (!floors[key] || compareVersions(match[1], floors[key]) > 0) {
        floors[key] = match[1];
      }
    }
  }
  if (!floors.angular) {
    throw new Error(
      'nenhum peer de Angular (@angular/*) nos pacotes publicados',
    );
  }
  if (!floors.tiptap) {
    throw new Error('nenhum peer de Tiptap (@tiptap/*) nos pacotes publicados');
  }
  return floors;
}

const normalizeCap = (value) =>
  !value ? null : typeof value === 'string' ? { version: value } : value;

/** Exige `reason` e `adr` em todo teto e em todo `skip` (X5). Lança em pt-BR. */
export function validateCompat(compatJson) {
  const problems = [];
  for (const [pkg, value] of Object.entries(compatJson.cap ?? {})) {
    const cap = normalizeCap(value);
    if (!cap) continue;
    const missing = ['reason', 'adr'].filter((k) => !cap[k]);
    if (!cap.version) missing.unshift('version');
    if (missing.length)
      problems.push(`teto de ${pkg} sem ${missing.join(' e ')}`);
  }
  for (const entry of compatJson.skip ?? []) {
    const missing = ['reason', 'adr'].filter((k) => !entry[k]);
    if (missing.length) {
      problems.push(`skip "${entry.leg}" sem ${missing.join(' e ')}`);
    }
  }
  if (problems.length) {
    throw new Error(`tools/compat.json inválido: ${problems.join('; ')}`);
  }
}

const legName = (angular, tiptap) => `compat (${angular}×${tiptap})`;
const bare = (name) => name.replace(/^compat \((.*)\)$/, '$1');

/**
 * Resolve as pernas. `view(pkg, spec)` devolve a versão: `spec` é o *major* ("22") ou uma
 * *dist-tag* ("next"). Devolve `{ legs, discarded, activeCaps }`: `discarded` leva o nome e a razão
 * de cada perna descartada (repetida, `next` igual ao último, `skip`); `activeCaps`, os tetos que
 * de fato limitaram o "último". `latest×latest` nunca é descartada por repetir o mínimo: é o
 * check obrigatório do PR (a perna `min×min` é o `verify` + `demo`, fora da lista).
 */
export function resolveLegs({ floors, view, compatJson, set }) {
  if (set !== 'pr' && set !== 'full') {
    throw new Error(`conjunto desconhecido: ${set} (use pr ou full)`);
  }
  const cap = compatJson.cap ?? {};
  const major = (version) => version.split('.')[0];
  const activeCaps = [];
  const capped = (pkg, floor, latest) => {
    const entry = normalizeCap(cap[pkg]);
    if (!entry) return latest;
    if (compareVersions(entry.version, floor) < 0) {
      throw new Error(
        `teto ${entry.version} de ${pkg} abaixo do piso dos peers (${floor})`,
      );
    }
    if (compareVersions(latest, entry.version) <= 0) return latest;
    if (!activeCaps.some((c) => c.pkg === pkg)) {
      activeCaps.push({ pkg, ...entry });
    }
    return entry.version;
  };

  const aMajor = major(floors.angular);
  const latestAngular = capped(
    'angular',
    floors.angular,
    view('@angular/core', aMajor),
  );
  const latestTooling = capped(
    'angular',
    floors.angular,
    view('@angular/cli', aMajor),
  );
  const latestTiptap = capped(
    'tiptap',
    floors.tiptap,
    view('@tiptap/core', major(floors.tiptap)),
  );
  const wanted = set === 'pr' ? FULL_LEGS.slice(0, 1) : FULL_LEGS;
  let next = null;
  if (wanted.some(([a]) => a === 'next')) {
    next = {
      version: view('@angular/core', 'next'),
      toolingVersion: view('@angular/cli', 'next'),
    };
  }

  const angularOf = (label) =>
    label === 'min'
      ? { label, version: floors.angular, toolingVersion: floors.angular }
      : label === 'latest'
        ? { label, version: latestAngular, toolingVersion: latestTooling }
        : { label, ...next };
  const tiptapOf = (label) => ({
    label,
    version: label === 'min' ? floors.tiptap : latestTiptap,
  });
  const keyOf = (l) =>
    [l.angular.version, l.angular.toolingVersion, l.tiptap.version].join('|');

  const skips = new Map((compatJson.skip ?? []).map((s) => [bare(s.leg), s]));
  const legs = [];
  const discarded = [];
  const seen = new Map([
    [
      keyOf({
        angular: angularOf('min'),
        tiptap: tiptapOf('min'),
      }),
      'min×min (verify e demo)',
    ],
  ]);
  for (const [aLabel, tLabel] of wanted) {
    const name = legName(aLabel, tLabel);
    const angular = angularOf(aLabel);
    const tiptap = tiptapOf(tLabel);
    const isNext = aLabel === 'next';
    const phaseB =
      !isNext &&
      (tiptap.version !== floors.tiptap ||
        (ANGULAR_PHASE_B &&
          (angular.version !== floors.angular ||
            angular.toolingVersion !== floors.angular)));
    const candidate = {
      name,
      angular,
      tiptap,
      phaseB,
      optional: isNext,
      legacyPeerDeps: isNext,
    };
    const skip = skips.get(bare(name));
    if (skip) {
      discarded.push({
        name,
        reason: `skip (${skip.reason}; ${skip.adr})`,
      });
      continue;
    }
    if (
      isNext &&
      angular.version === latestAngular &&
      angular.toolingVersion === latestTooling
    ) {
      discarded.push({ name, reason: 'next igual ao último' });
      continue;
    }
    const key = keyOf(candidate);
    const same = seen.get(key);
    if (same && name !== legName('latest', 'latest')) {
      discarded.push({
        name,
        reason: `repete as versões resolvidas de ${same}`,
      });
      continue;
    }
    if (!same) seen.set(key, bare(name));
    legs.push(candidate);
  }
  return { legs, discarded, activeCaps };
}

/**
 * Comando da fase B: UM `npm install --no-save` com os pacotes de todas as famílias que a perna
 * muda (Angular e Tiptap). Não pode ser um por família: o segundo `--no-save` reinstala a árvore
 * do *lockfile* e desfaz o primeiro (spike da 08a, T1). `npm` é o comando do npm em palavras
 * (`['npx','-y','npm@11']`; padrão `['npm']`). Devolve lista (vazia sem fase B) por simetria.
 */
export function installCommands(leg, fams, npm = ['npm']) {
  if (!leg.phaseB) return [];
  const base = [
    ...npm.slice(1),
    'install',
    '--no-save',
    '--no-audit',
    '--no-fund',
    ...(leg.legacyPeerDeps ? ['--legacy-peer-deps'] : []),
  ];
  const packages = [];
  if (ANGULAR_PHASE_B && leg.angular.label !== 'min') {
    packages.push(
      ...fams.framework.map((n) => `${n}@${leg.angular.version}`),
      ...fams.tooling.map((n) => `${n}@${leg.angular.toolingVersion}`),
    );
  }
  if (leg.tiptap.label !== 'min') {
    packages.push(...fams.tiptap.map((n) => `${n}@${leg.tiptap.version}`));
  }
  return packages.length ? [{ cmd: npm[0], args: [...base, ...packages] }] : [];
}

/** Pacotes e versões esperadas no `npm ls` depois da fase B. */
function expectedVersions(leg) {
  const out = {};
  if (leg.phaseB) {
    if (ANGULAR_PHASE_B && leg.angular.label !== 'min') {
      out['@angular/core'] = leg.angular.version;
      out['@angular/cli'] = leg.angular.toolingVersion;
    }
    if (leg.tiptap.label !== 'min') out['@tiptap/core'] = leg.tiptap.version;
  }
  return out;
}

/** Nomes que `npm ls` deve mostrar para a prova da perna. */
export const provenPackages = (leg) => Object.keys(expectedVersions(leg));

/** Prova por `npm ls --json`: a versão instalada é a da perna, senão lança em pt-BR. */
export function proveInstalled(leg, ls) {
  for (const [name, expected] of Object.entries(expectedVersions(leg))) {
    const found = ls?.dependencies?.[name]?.version;
    if (!found) {
      throw new Error(
        `${name} ausente do npm ls (perna ${leg.name}, esperado ${expected})`,
      );
    }
    if (found !== expected) {
      throw new Error(
        `${name}: o npm ls mostra ${found}, esperado ${expected} (perna ${leg.name}); a reinstalação da fase B não pegou`,
      );
    }
  }
}

/** Conteúdo do `--versions` do `consumer.mjs prepare`. */
export function versionsFile(leg) {
  return {
    name: leg.name,
    angular: {
      version: leg.angular.version,
      toolingVersion: leg.angular.toolingVersion,
    },
    tiptap: { version: leg.tiptap.version },
    legacyPeerDeps: leg.legacyPeerDeps,
  };
}

// ---- CLI --------------------------------------------------------------------------------------

function npmView(npm) {
  return (pkg, spec) => {
    const isTag = !/^\d/.test(spec);
    const args = [
      ...npm.slice(1),
      'view',
      isTag ? pkg : `${pkg}@${spec}`,
      isTag ? `dist-tags.${spec}` : 'version',
      '--json',
    ];
    const result = spawnSync(npm[0], args, {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0 || !result.stdout.trim()) {
      throw new Error(`npm view ${pkg}@${spec} falhou: ${result.stderr}`);
    }
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed.at(-1) : parsed;
  };
}

function readCompatJson(root, fs) {
  return JSON.parse(
    fs.readFileSync(join(root, 'tools', 'compat.json'), 'utf8'),
  );
}

function optionValue(argv, name) {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
}

/** Perna a partir de `--leg-json` (a do job `legs`, sem nova resolução) ou `--leg` (resolve `full`). */
function legFromArgs(argv, { root, fs, view }) {
  const json = optionValue(argv, '--leg-json');
  if (json) return JSON.parse(json);
  const wanted = optionValue(argv, '--leg');
  if (!wanted) throw new Error('informe --leg <nome> ou --leg-json <json>');
  const { legs } = resolveLegs({
    floors: readFloors(root, fs),
    view,
    compatJson: readCompatJson(root, fs),
    set: 'full',
  });
  const leg = legs.find((l) => bare(l.name) === bare(wanted));
  if (!leg) {
    throw new Error(
      `perna ${wanted} não existe ou foi descartada; pernas: ${legs.map((l) => l.name).join(', ')}`,
    );
  }
  return leg;
}

export async function main(argv, env = process.env, deps = {}) {
  const root = deps.root ?? REPO_ROOT;
  const fs = deps.fs ?? nodeFs;
  const npm = (env.RTE_NPM ?? 'npm').trim().split(/\s+/).filter(Boolean);
  const view = deps.view ?? npmView(npm);
  const [command] = argv;
  if (command === 'legs') {
    const set = optionValue(argv, '--set') ?? 'pr';
    const compatJson = readCompatJson(root, fs);
    validateCompat(compatJson);
    const { legs, discarded, activeCaps } = resolveLegs({
      floors: readFloors(root, fs),
      view,
      compatJson,
      set,
    });
    process.stdout.write(`${JSON.stringify({ include: legs })}\n`);
    for (const leg of legs) {
      console.error(
        `${leg.name}: angular ${leg.angular.version} (ferramentas ${leg.angular.toolingVersion}), tiptap ${leg.tiptap.version}, fase B ${leg.phaseB ? 'sim' : 'não'}${leg.optional ? ', opcional' : ''}`,
      );
    }
    for (const d of discarded)
      console.error(`descartada: ${d.name}: ${d.reason}`);
    for (const c of activeCaps) {
      console.error(
        `TETO ATIVO: ${c.pkg} limitado a ${c.version} (${c.reason}; ${c.adr})`,
      );
    }
    return;
  }
  if (command === 'install') {
    const leg = legFromArgs(argv, { root, fs, view });
    const fams = families(
      JSON.parse(fs.readFileSync(join(root, 'package.json'), 'utf8')),
    );
    const run =
      deps.run ??
      ((cmd, args) =>
        spawnSync(cmd, args, {
          cwd: root,
          stdio: 'inherit',
          shell: process.platform === 'win32',
        }));
    for (const { cmd, args } of installCommands(leg, fams, npm)) {
      const result = run(cmd, args);
      if (result.status !== 0) {
        throw new Error(`falhou: ${cmd} ${args.slice(0, 6).join(' ')}...`);
      }
    }
    const names = provenPackages(leg);
    if (!names.length) {
      console.log(`${leg.name}: sem fase B, nada a provar`);
      return;
    }
    const ls = deps.ls
      ? deps.ls(names)
      : JSON.parse(
          spawnSync(
            npm[0],
            [...npm.slice(1), 'ls', '--json', '--depth=0', ...names],
            {
              cwd: root,
              encoding: 'utf8',
              shell: process.platform === 'win32',
              maxBuffer: 64 * 1024 * 1024,
            },
          ).stdout,
        );
    proveInstalled(leg, ls);
    console.log(
      `${leg.name}: instalado e provado por npm ls (${names.map((n) => `${n}@${ls.dependencies[n].version}`).join(', ')})`,
    );
    return;
  }
  if (command === 'versions') {
    const leg = legFromArgs(argv, { root, fs, view });
    const out = optionValue(argv, '--out');
    if (!out) throw new Error('informe --out <arquivo>');
    fs.writeFileSync(out, `${JSON.stringify(versionsFile(leg), null, 2)}\n`);
    return;
  }
  throw new Error(
    'uso: node tools/compat.mjs <legs --set pr|full | install --leg <nome> | versions --leg <nome> --out <arquivo>>',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
