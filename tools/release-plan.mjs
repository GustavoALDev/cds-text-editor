// Confere o plano de versões do Changesets sem publicar nada (spec 09c, AP13):
// os 5 pacotes num único grupo `fixed` e nenhuma versão planejada >= 1.0.0
// (a 1.0 exige RTE_ALLOW_1_0=1 no PR dela).
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function major(version) {
  const n = Number.parseInt(String(version).split('.')[0] ?? '', 10);
  return Number.isNaN(n) ? 0 : n;
}

export function checkReleasePlan({ status, config, packages, env }) {
  const errors = [];
  const fixed = config?.fixed ?? [];
  const group = fixed.length === 1 ? fixed[0] : null;
  if (!group) {
    errors.push(
      `.changeset/config.json: o grupo fixed deve ser um só, com os ${packages.length} pacotes (há ${fixed.length} grupo(s))`,
    );
  } else {
    for (const name of packages) {
      if (!group.includes(name)) {
        errors.push(`.changeset/config.json: o grupo fixed não inclui ${name}`);
      }
    }
    for (const name of group) {
      if (!packages.includes(name)) {
        errors.push(
          `.changeset/config.json: o grupo fixed inclui ${name}, que não é um dos pacotes`,
        );
      }
    }
  }
  for (const r of status?.releases ?? []) {
    if (!packages.includes(r.name)) {
      errors.push(
        `plano de versões: ${r.name} está fora dos pacotes (${packages.join(', ')})`,
      );
      continue;
    }
    if (major(r.newVersion) >= 1 && env?.RTE_ALLOW_1_0 !== '1') {
      errors.push(
        `plano de versões: ${r.name} sairia em ${r.newVersion} (>= 1.0.0); a 1.0 exige RTE_ALLOW_1_0=1 no PR dela`,
      );
    }
  }
  return errors;
}

function workspacePackages(root) {
  const dir = join(root, 'packages');
  return readdirSync(dir)
    .map((d) => join(dir, d, 'package.json'))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, 'utf8')).name)
    .sort();
}

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const i = args.indexOf('--status');
  let statusFile = i >= 0 ? args[i + 1] : undefined;
  if (!statusFile) {
    statusFile = join(
      mkdtempSync(join(tmpdir(), 'release-plan-')),
      'status.json',
    );
    const r = spawnSync(
      'npx',
      ['changeset', 'status', `--output=${statusFile}`],
      { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
    );
    if (r.status !== 0) {
      console.error('release-plan: o comando changeset status falhou');
      process.exit(1);
    }
  }
  const status = JSON.parse(readFileSync(resolve(root, statusFile), 'utf8'));
  const config = JSON.parse(
    readFileSync(join(root, '.changeset/config.json'), 'utf8'),
  );
  const errors = checkReleasePlan({
    status,
    config,
    packages: workspacePackages(root),
    env: process.env,
  });
  for (const e of errors) console.error(e);
  if (!errors.length) {
    for (const r of status.releases ?? []) {
      console.log(`${r.name}: ${r.oldVersion} -> ${r.newVersion} (${r.type})`);
    }
  }
  process.exit(errors.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
