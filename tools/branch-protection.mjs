// Confere `.github/branch-protection.json` (spec 08a, X13) contra os workflows: cada check exigido
// precisa existir como job de `ci.yml` ou como perna do `compat.yml` chamado pelo job `compat`.
// Node puro. A proteção NÃO é aplicada por aqui (passo manual, ver o ADR 0019).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ids dos jobs (chaves de `jobs:` com recuo de 2 espaços) de um workflow. */
export function jobIds(workflowText) {
  const lines = workflowText.split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return [];
  const ids = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.startsWith('#')) break;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) ids.push(m[1]);
  }
  return ids;
}

/** Nomes de check que os workflows produzem em `pull_request`, dado o nome da perna do PR. */
export function producedChecks({ ci, compat, prLegName }) {
  const names = new Set(jobIds(ci));
  const caller =
    /^ {2}(\w[\w-]*):\n(?: {4}.*\n)*? {4}uses:\s*\.\/\.github\/workflows\/compat\.yml/m.exec(
      ci.replace(/\r\n/g, '\n'),
    );
  if (caller && jobIds(compat).includes('compat')) {
    names.add(`${caller[1]} / ${prLegName}`);
  }
  return names;
}

export function checkBranchProtection({ protection, ci, compat, prLegName }) {
  const errors = [];
  if (protection.enforce_admins !== true) {
    errors.push('branch-protection.json: enforce_admins precisa ser true');
  }
  if (protection.required_status_checks?.strict !== true) {
    errors.push(
      'branch-protection.json: required_status_checks.strict precisa ser true (branch atualizado antes do merge)',
    );
  }
  const contexts = protection.required_status_checks?.contexts ?? [];
  if (!contexts.length) {
    errors.push('branch-protection.json: nenhum check exigido');
  }
  const produced = producedChecks({ ci, compat, prLegName });
  for (const name of contexts) {
    if (!produced.has(name)) {
      errors.push(
        `branch-protection.json: o check exigido "${name}" não existe nos workflows (existentes: ${[...produced].join(', ')})`,
      );
    }
  }
  return errors;
}

export function readRepo(root = ROOT) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  return {
    protection: JSON.parse(read('.github/branch-protection.json')),
    ci: read('.github/workflows/ci.yml'),
    compat: read('.github/workflows/compat.yml'),
  };
}
