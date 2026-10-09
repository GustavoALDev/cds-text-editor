import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANGULAR_PHASE_B,
  classify,
  families,
  highestVersion,
  installCommands,
  isDocsOnly,
  parseLs,
  proveInstalled,
  readFloors,
  resolveLegs,
  validateCompat,
  versionsFile,
} from './compat.mjs';

/** `fs` falso: `packages/<dir>/package.json` a partir de um mapa. */
function fakeFs(packages) {
  const dirs = Object.keys(packages);
  return {
    readdirSync: () => dirs,
    readFileSync: (path) => {
      const dir = dirs.find((d) =>
        path.replaceAll('\\', '/').includes(`/${d}/`),
      );
      if (!dir) throw new Error(`sem ${path}`);
      return JSON.stringify(packages[dir]);
    },
    existsSync: (path) =>
      dirs.some((d) => path.replaceAll('\\', '/').includes(`/${d}/`)),
  };
}

const FLOORS = { angular: '22.2.1', tiptap: '3.31.4' };
const NONE = { cap: {}, skip: [] };

/** `npm view` falso: `table["<pacote>@<spec>"]`. */
const viewOf = (table) => (pkg, spec) => {
  const key = `${pkg}@${spec}`;
  if (!(key in table)) throw new Error(`view sem resposta para ${key}`);
  return table[key];
};

const VIEW_NEW = viewOf({
  '@angular/core@22': '22.4.0',
  '@angular/cli@22': '22.4.2',
  '@angular/core@next': '23.0.0-next.1',
  '@angular/cli@next': '23.0.0-next.2',
  '@tiptap/core@3': '3.35.0',
});

test('readFloors lê o piso dos peers publicados', () => {
  const fs = fakeFs({
    angular: {
      name: '@cds/rte-angular',
      peerDependencies: {
        '@angular/core': '>=22.2.1 <23',
        '@angular/forms': '>=22.2.1 <23',
        '@cds/rte-core': '0.0.0',
        '@tiptap/core': '^3.31.4',
      },
    },
    core: {
      name: '@cds/rte-core',
      peerDependencies: { '@tiptap/extension-bold': '^3.31.4' },
    },
  });
  assert.deepEqual(readFloors('/repo', fs), FLOORS);
});

test('readFloors pega o maior piso quando os pacotes divergem', () => {
  const fs = fakeFs({
    a: { peerDependencies: { '@angular/core': '>=22.2.1 <23' } },
    b: {
      peerDependencies: {
        '@angular/common': '>=22.3.0 <23',
        '@tiptap/core': '^3.31.4',
      },
    },
    c: { peerDependencies: { '@tiptap/pm': '^3.32.0' } },
  });
  assert.deepEqual(readFloors('/repo', fs), {
    angular: '22.3.0',
    tiptap: '3.32.0',
  });
});

test('readFloors falha em pt-BR se o formato do peer não casar', () => {
  const fs = fakeFs({
    a: {
      name: '@cds/rte-angular',
      peerDependencies: { '@angular/core': 'latest', '@tiptap/core': '^3.1.0' },
    },
  });
  assert.throws(() => readFloors('/repo', fs), /@angular\/core.*latest.*piso/s);
});

test('readFloors falha se faltar o peer de Angular ou de Tiptap', () => {
  const fs = fakeFs({
    a: { peerDependencies: { '@tiptap/core': '^3.1.0' } },
  });
  assert.throws(() => readFloors('/repo', fs), /Angular/);
});

test('resolveLegs full: último por major, 3 pernas estáveis mais next opcional', () => {
  const { legs, discarded } = resolveLegs({
    floors: FLOORS,
    view: VIEW_NEW,
    compatJson: NONE,
    set: 'full',
  });
  assert.deepEqual(
    legs.map((l) => l.name),
    [
      'compat (latest×latest)',
      'compat (min×latest)',
      'compat (latest×min)',
      'compat (next×latest)',
    ],
  );
  assert.deepEqual(discarded, []);
  const [ll, ml, lm, nl] = legs;
  assert.deepEqual(ll.angular, {
    label: 'latest',
    version: '22.4.0',
    toolingVersion: '22.4.2',
  });
  assert.deepEqual(ll.tiptap, { label: 'latest', version: '3.35.0' });
  assert.equal(ml.angular.version, '22.2.1');
  assert.equal(ml.tiptap.version, '3.35.0');
  assert.equal(lm.tiptap.version, '3.31.4');
  assert.equal(lm.angular.version, '22.4.0');
  assert.equal(nl.angular.version, '23.0.0-next.1');
  assert.equal(nl.angular.toolingVersion, '23.0.0-next.2');
  assert.equal(nl.optional, true);
  assert.equal(nl.phaseB, false);
  assert.equal(nl.legacyPeerDeps, true);
  assert.equal(ll.optional, false);
  assert.equal(ll.legacyPeerDeps, false);
  assert.ok(!legs.some((l) => l.name.includes('min×min')));
});

test('resolveLegs pr: só latest×latest', () => {
  const { legs } = resolveLegs({
    floors: FLOORS,
    view: VIEW_NEW,
    compatJson: NONE,
    set: 'pr',
  });
  assert.deepEqual(
    legs.map((l) => l.name),
    ['compat (latest×latest)'],
  );
});

test('resolveLegs: conjunto desconhecido lança', () => {
  assert.throws(
    () =>
      resolveLegs({
        floors: FLOORS,
        view: VIEW_NEW,
        compatJson: NONE,
        set: 'tudo',
      }),
    /pr.*full/,
  );
});

test('resolveLegs: latest×latest nunca some (check obrigatório); repetidas são descartadas', () => {
  const same = viewOf({
    '@angular/core@22': '22.2.1',
    '@angular/cli@22': '22.2.1',
    '@angular/core@next': '22.3.0-next.0',
    '@angular/cli@next': '22.3.0-next.1',
    '@tiptap/core@3': '3.31.4',
  });
  const out = resolveLegs({
    floors: FLOORS,
    view: same,
    compatJson: NONE,
    set: 'full',
  });
  assert.deepEqual(
    out.legs.map((l) => l.name),
    ['compat (latest×latest)', 'compat (next×latest)'],
  );
  assert.equal(out.legs[0].phaseB, false);
  assert.deepEqual(
    out.discarded.map((d) => d.name),
    ['compat (min×latest)', 'compat (latest×min)'],
  );
  assert.match(out.discarded[0].reason, /repete/);
});

test('resolveLegs: phaseB quando o Tiptap difere do piso; next igual ao último é descartado', () => {
  const tiptapOnly = viewOf({
    '@angular/core@22': '22.2.1',
    '@angular/cli@22': '22.2.1',
    '@angular/core@next': '22.2.1',
    '@angular/cli@next': '22.2.1',
    '@tiptap/core@3': '3.33.0',
  });
  const t = resolveLegs({
    floors: FLOORS,
    view: tiptapOnly,
    compatJson: NONE,
    set: 'full',
  });
  assert.deepEqual(
    t.legs.map((l) => [l.name, l.phaseB]),
    [['compat (latest×latest)', true]],
  );
  assert.deepEqual(
    t.discarded.map((d) => d.name),
    ['compat (min×latest)', 'compat (latest×min)', 'compat (next×latest)'],
  );
  assert.match(t.discarded[2].reason, /igual ao último/);
});

test('resolveLegs: Angular diferente do piso conta na fase B conforme ANGULAR_PHASE_B', () => {
  const { legs } = resolveLegs({
    floors: FLOORS,
    view: viewOf({
      '@angular/core@22': '22.4.0',
      '@angular/cli@22': '22.4.0',
      '@angular/core@next': '22.4.0',
      '@angular/cli@next': '22.4.0',
      '@tiptap/core@3': '3.31.4',
    }),
    compatJson: NONE,
    set: 'pr',
  });
  assert.equal(legs[0].phaseB, ANGULAR_PHASE_B);
});

test('teto limita o último; abaixo do piso lança', () => {
  const compatJson = {
    cap: {
      tiptap: { version: '3.33.0', reason: 'regressão', adr: 'adr#x' },
    },
    skip: [],
  };
  const { legs, activeCaps } = resolveLegs({
    floors: FLOORS,
    view: VIEW_NEW,
    compatJson,
    set: 'pr',
  });
  assert.equal(legs[0].tiptap.version, '3.33.0');
  assert.deepEqual(activeCaps, [
    { pkg: 'tiptap', version: '3.33.0', reason: 'regressão', adr: 'adr#x' },
  ]);
  // forma curta da spec; teto acima do último não limita
  const curto = resolveLegs({
    floors: FLOORS,
    view: VIEW_NEW,
    compatJson: { cap: { tiptap: '3.40.0' }, skip: [] },
    set: 'pr',
  });
  assert.equal(curto.legs[0].tiptap.version, '3.35.0');
  assert.deepEqual(curto.activeCaps, []);
  const angular = resolveLegs({
    floors: FLOORS,
    view: VIEW_NEW,
    compatJson: { cap: { angular: '22.3.0' }, skip: [] },
    set: 'pr',
  });
  assert.equal(angular.legs[0].angular.version, '22.3.0');
  assert.equal(angular.legs[0].angular.toolingVersion, '22.3.0');
  assert.throws(
    () =>
      resolveLegs({
        floors: FLOORS,
        view: VIEW_NEW,
        compatJson: { cap: { tiptap: '3.30.0' }, skip: [] },
        set: 'pr',
      }),
    /abaixo do piso/,
  );
});

test('skip remove a perna e registra o descarte', () => {
  const { legs, discarded } = resolveLegs({
    floors: FLOORS,
    view: VIEW_NEW,
    compatJson: {
      cap: {},
      skip: [{ leg: 'latest×min', reason: 'quebra', adr: 'adr#y' }],
    },
    set: 'full',
  });
  assert.ok(!legs.some((l) => l.name === 'compat (latest×min)'));
  assert.match(
    discarded.find((d) => d.name === 'compat (latest×min)').reason,
    /skip.*quebra/,
  );
});

test('validateCompat exige reason e adr em teto e skip', () => {
  assert.doesNotThrow(() =>
    validateCompat({ cap: { angular: null, tiptap: null }, skip: [] }),
  );
  assert.doesNotThrow(() =>
    validateCompat({
      cap: { tiptap: { version: '3.40.0', reason: 'r', adr: 'a' } },
      skip: [{ leg: 'next×latest', reason: 'r', adr: 'a' }],
    }),
  );
  assert.throws(
    () => validateCompat({ cap: { tiptap: '3.40.0' }, skip: [] }),
    /teto.*tiptap.*reason.*adr/s,
  );
  assert.throws(
    () =>
      validateCompat({
        cap: { tiptap: { version: '3.40.0', reason: 'só motivo' } },
      }),
    /adr/,
  );
  assert.throws(
    () =>
      validateCompat({ cap: {}, skip: [{ leg: 'latest×min', reason: 'r' }] }),
    /skip.*latest×min.*adr/s,
  );
});

const ROOT = {
  devDependencies: {
    '@angular/core': '22.2.1',
    '@angular/common': '22.2.1',
    '@angular/compiler': '22.2.1',
    '@angular/compiler-cli': '22.2.1',
    '@angular/forms': '22.2.1',
    '@angular/platform-browser': '22.2.1',
    '@angular/platform-server': '22.2.1',
    '@angular/router': '22.2.1',
    '@angular/cli': '22.2.1',
    '@angular/build': '22.2.1',
    '@angular/ssr': '22.2.1',
    '@angular-devkit/core': '22.2.1',
    '@angular-devkit/schematics': '22.2.1',
    '@schematics/angular': '22.2.1',
    '@tiptap/core': '3.31.4',
    '@tiptap/pm': '3.31.4',
    '@tiptap/extension-bold': '3.31.4',
    '@nx/angular': '23.2.1',
    typescript: '6.0.3',
  },
};

test('classify separa framework, ferramentas e tiptap por prefixo', () => {
  assert.equal(classify('@angular/core'), 'framework');
  assert.equal(classify('@angular/compiler-cli'), 'framework');
  assert.equal(classify('@angular/cli'), 'tooling');
  assert.equal(classify('@angular/ssr'), 'tooling');
  assert.equal(classify('@angular-devkit/schematics'), 'tooling');
  assert.equal(classify('@schematics/angular'), 'tooling');
  assert.equal(classify('@tiptap/extension-link'), 'tiptap');
  assert.equal(classify('@angular/aria'), null);
  assert.equal(classify('@nx/angular'), null);
});

test('families lista as famílias a partir das devDependencies', () => {
  const f = families(ROOT);
  assert.deepEqual(f.framework.sort(), [
    '@angular/common',
    '@angular/compiler',
    '@angular/compiler-cli',
    '@angular/core',
    '@angular/forms',
    '@angular/platform-browser',
    '@angular/platform-server',
    '@angular/router',
  ]);
  assert.deepEqual(f.tooling.sort(), [
    '@angular-devkit/core',
    '@angular-devkit/schematics',
    '@angular/build',
    '@angular/cli',
    '@angular/ssr',
    '@schematics/angular',
  ]);
  assert.deepEqual(f.tiptap.sort(), [
    '@tiptap/core',
    '@tiptap/extension-bold',
    '@tiptap/pm',
  ]);
});

function leg(over = {}) {
  return {
    name: 'compat (latest×latest)',
    angular: { label: 'latest', version: '22.4.0', toolingVersion: '22.4.2' },
    tiptap: { label: 'latest', version: '3.35.0' },
    phaseB: true,
    optional: false,
    legacyPeerDeps: false,
    ...over,
  };
}

test('installCommands: um único npm install --no-save com as duas famílias, ferramentas na versão do cli', () => {
  const cmds = installCommands(leg(), families(ROOT));
  assert.equal(cmds.length, 1, 'um segundo --no-save desfaria o primeiro');
  const [{ cmd, args }] = cmds;
  assert.equal(cmd, 'npm');
  assert.deepEqual(args.slice(0, 4), [
    'install',
    '--no-save',
    '--no-audit',
    '--no-fund',
  ]);
  assert.ok(args.includes('@angular/core@22.4.0'));
  assert.ok(args.includes('@angular/compiler-cli@22.4.0'));
  assert.ok(args.includes('@angular/cli@22.4.2'));
  assert.ok(args.includes('@angular-devkit/schematics@22.4.2'));
  assert.ok(args.includes('@schematics/angular@22.4.2'));
  assert.ok(args.includes('@tiptap/pm@3.35.0'));
  assert.ok(args.includes('@tiptap/core@3.35.0'));
});

test('installCommands: pula a família no mínimo e usa o npm informado', () => {
  const cmds = installCommands(
    leg({
      angular: { label: 'min', version: '22.2.1', toolingVersion: '22.2.1' },
    }),
    families(ROOT),
    ['npx', '-y', 'npm@11'],
  );
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].cmd, 'npx');
  assert.deepEqual(cmds[0].args.slice(0, 3), ['-y', 'npm@11', 'install']);
  assert.ok(cmds[0].args.includes('@tiptap/core@3.35.0'));
  assert.ok(!cmds[0].args.some((a) => a.startsWith('@angular')));
  assert.ok(!cmds[0].args.includes('--legacy-peer-deps'));
});

test('installCommands: reinstalar o Angular usa --legacy-peer-deps (ERESOLVE do npm com os peers do workspace)', () => {
  const [{ args }] = installCommands(leg(), families(ROOT));
  assert.ok(args.includes('--legacy-peer-deps'));
});

test('installCommands: sem fase B não há instalação; legacyPeerDeps acrescenta a flag', () => {
  assert.deepEqual(installCommands(leg({ phaseB: false }), families(ROOT)), []);
  const cmds = installCommands(leg({ legacyPeerDeps: true }), families(ROOT));
  assert.ok(cmds.every((c) => c.args.includes('--legacy-peer-deps')));
});

const lsOf = (versions) => ({
  dependencies: Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [name, { version }]),
  ),
});

test('proveInstalled passa quando o npm ls coincide e falha em pt-BR quando não', () => {
  const ok = lsOf({
    '@angular/core': '22.4.0',
    '@angular/cli': '22.4.2',
    '@tiptap/core': '3.35.0',
  });
  assert.doesNotThrow(() => proveInstalled(leg(), ok));
  assert.throws(
    () =>
      proveInstalled(
        leg(),
        lsOf({
          '@angular/core': '22.2.1',
          '@angular/cli': '22.4.2',
          '@tiptap/core': '3.35.0',
        }),
      ),
    /@angular\/core.*22\.2\.1.*22\.4\.0/s,
  );
  assert.throws(
    () => proveInstalled(leg(), lsOf({ '@angular/core': '22.4.0' })),
    /@angular\/cli.*ausente/s,
  );
});

test('versionsFile devolve o conteúdo do --versions', () => {
  assert.deepEqual(versionsFile(leg()), {
    name: 'compat (latest×latest)',
    angular: { version: '22.4.0', toolingVersion: '22.4.2' },
    tiptap: { version: '3.35.0' },
    legacyPeerDeps: false,
  });
});

test('resolveLegs: next menor que o último estável é descartado', () => {
  const older = viewOf({
    '@angular/core@22': '22.4.0',
    '@angular/cli@22': '22.4.2',
    '@angular/core@next': '22.3.0-next.1',
    '@angular/cli@next': '22.3.0-next.1',
    '@tiptap/core@3': '3.35.0',
  });
  const out = resolveLegs({
    floors: FLOORS,
    view: older,
    compatJson: NONE,
    set: 'full',
  });
  assert.ok(!out.legs.some((l) => l.name === 'compat (next×latest)'));
  const d = out.discarded.find((x) => x.name === 'compat (next×latest)');
  assert.match(d.reason, /next.*anterior.*estável/);
});

test('highestVersion escolhe o maior por compareVersions, não o último da lista', () => {
  assert.equal(highestVersion(['22.10.0', '22.9.0', '22.2.1']), '22.10.0');
  assert.equal(highestVersion('22.4.0'), '22.4.0');
  assert.throws(() => highestVersion([]), /sem versões/);
});

test('parseLs: saída vazia do npm ls vira erro claro em pt-BR', () => {
  assert.throws(() => parseLs('', 'ERR! boom'), /npm ls.*vazia.*boom/s);
  assert.throws(() => parseLs('  \n', ''), /npm ls.*vazia/s);
  assert.deepEqual(parseLs('{"dependencies":{}}', ''), { dependencies: {} });
  assert.throws(() => parseLs('nao json', ''), /npm ls.*JSON/s);
});

test('isDocsOnly: só documentação pura dispensa a matriz', () => {
  assert.equal(
    isDocsOnly(['docs/specs/x.md', 'README.md', 'packages/core/CHANGELOG.md']),
    true,
  );
  assert.equal(isDocsOnly(['docs/decisions/0019.md']), true);
  assert.equal(
    isDocsOnly(['docs/specs/x.md', 'packages/core/src/a.ts']),
    false,
  );
  assert.equal(isDocsOnly(['.github/workflows/compat.yml']), false);
  assert.equal(isDocsOnly(['tools/compat.json']), false);
  assert.equal(isDocsOnly([]), false);
});
