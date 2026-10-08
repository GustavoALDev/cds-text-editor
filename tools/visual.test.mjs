import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockerArgs, main, playwrightVersion } from './visual.mjs';

test('playwrightVersion lê a versão exata do package.json real', () => {
  assert.match(playwrightVersion(), /^\d+\.\d+\.\d+$/);
});

test('dockerArgs monta imagem, ambiente, volume e repassa os argumentos', () => {
  const args = dockerArgs({
    cwd: '/repo',
    version: '1.63.0',
    extra: ['--update-snapshots=changed', '--project=visual-chromium'],
  });
  assert.equal(args[0], 'run');
  assert.ok(args.includes('--ipc=host'));
  assert.ok(args.includes('--init'));
  assert.ok(args.includes('RTE_VISUAL_CONTAINER=1'));
  assert.ok(args.includes('/repo:/work'));
  assert.ok(args.includes('mcr.microsoft.com/playwright:v1.63.0-noble'));
  const inner = args.at(-1);
  assert.match(inner, /npx playwright test -c e2e\/visual/);
  assert.match(inner, /--update-snapshots=changed/);
  assert.match(inner, /--project=visual-chromium/);
});

test('dockerArgs cita argumentos com espaços', () => {
  const args = dockerArgs({
    cwd: '/r',
    version: '1.0.0',
    extra: ['-g', 'a b'],
  });
  assert.match(args.at(-1), /-g 'a b'/);
});

test('sem Docker: código 2 e mensagem em pt-BR apontando o workflow', () => {
  const logs = [];
  const code = main([], {
    exec: () => ({ status: 1 }),
    log: (m) => logs.push(m),
  });
  assert.equal(code, 2);
  assert.match(logs.join('\n'), /visual-update\.yml/);
  assert.match(logs.join('\n'), /Docker não encontrado/);
});

test('com Docker: executa o docker run e devolve o status', () => {
  const calls = [];
  const code = main(['--update-snapshots=changed'], {
    exec: (cmd, args) => {
      calls.push([cmd, args]);
      return { status: args[0] === 'info' ? 0 : 3 };
    },
  });
  assert.equal(code, 3);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'docker');
  assert.equal(calls[1][1][0], 'run');
});

test('dockerArgs escapa aspas simples', () => {
  const args = dockerArgs({ cwd: '/r', version: '1.0.0', extra: ["a'b"] });
  assert.ok(args.at(-1).includes(String.raw`'a'\''b'`));
});
