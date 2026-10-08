import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function specs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'test-results') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...specs(full));
    else if (name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const listed = JSON.parse(
  readFileSync(join(ROOT, 'tools', 'compat-tags.json'), 'utf8'),
);
const tagged = specs(join(ROOT, 'e2e'))
  .filter((f) => readFileSync(f, 'utf8').includes("'@compat'"))
  .map((f) => relative(ROOT, f).split(sep).join('/'))
  .sort();

test('toda spec com @compat está em tools/compat-tags.json', () => {
  for (const file of tagged) {
    assert.ok(
      listed.includes(file),
      `${file} tem a marca @compat mas não está em tools/compat-tags.json`,
    );
  }
});

test('toda spec de tools/compat-tags.json tem a marca @compat', () => {
  for (const file of listed) {
    assert.ok(
      tagged.includes(file),
      `${file} está em tools/compat-tags.json mas não tem a marca @compat`,
    );
  }
});

test('a lista @compat fixada tem as 15 specs da X6, em ordem', () => {
  assert.equal(listed.length, 15);
  assert.deepEqual([...listed].sort(), listed);
});
