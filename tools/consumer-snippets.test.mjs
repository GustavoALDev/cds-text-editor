import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  CUSTOM_STATE,
  SNIPPETS_DIR,
  snippetCases,
  snippetFiles,
  snippetsTsconfig,
  tscCommand,
  withMjsImports,
} from './consumer.mjs';

// check-snippets (spec 07b, W13): partes puras. O `tsc` real roda no job `demo` do CI.

const model = {
  DEFAULT_STATE: { primary: '#000', radius: 6, density: 1, mode: 'auto' },
  PRESET_NAMES: ['angular', 'ocean', 'forest', 'sunset', 'monochrome'],
  applyPreset: (state, name) => ({ ...state, primary: `#${name}` }),
};

test('snippetCases: 5 presets e o tema próprio, nesta ordem', () => {
  const cases = snippetCases(model);
  assert.deepEqual(
    cases.map((c) => c.name),
    [
      'preset-angular',
      'preset-ocean',
      'preset-forest',
      'preset-sunset',
      'preset-monochrome',
      'custom',
    ],
  );
  assert.equal(cases[1].state.primary, '#ocean');
  assert.deepEqual(cases[5].state, { ...model.DEFAULT_STATE, ...CUSTOM_STATE });
  assert.equal(CUSTOM_STATE.secondary, 'banana');
  assert.equal(CUSTOM_STATE.radius, 2);
  assert.equal(CUSTOM_STATE.density, 0.9);
});

test('snippetFiles: um .ts por caso com o texto de buildTs', () => {
  const files = snippetFiles(snippetCases(model), (s) => `// ${s.primary}\n`);
  assert.equal(files.length, 6);
  assert.deepEqual(files[0], {
    file: 'preset-angular.ts',
    content: '// #angular\n',
  });
  assert.equal(files[5].file, 'custom.ts');
  assert.equal(new Set(files.map((f) => f.file)).size, 6);
});

test('snippetsTsconfig: estrito, noEmit, só os .ts da pasta', () => {
  const config = snippetsTsconfig();
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.deepEqual(config.include, ['*.ts']);
});

test('tscCommand: tsc do consumidor, projeto dos snippets, cwd do consumidor', () => {
  const c = join('/consumer');
  const { cmd, args, cwd } = tscCommand({ consumerDir: c });
  assert.equal(cmd, process.execPath);
  assert.equal(cwd, c);
  assert.match(
    args[0].replaceAll('\\', '/'),
    /node_modules\/typescript\/bin\/tsc$/,
  );
  assert.deepEqual(args.slice(1), [
    '-p',
    join(SNIPPETS_DIR, 'tsconfig.json'),
    '--noEmit',
  ]);
});

test('withMjsImports: importações relativas ganham .mjs; pacotes ficam', () => {
  const js = [
    "import { a } from './model';",
    'import { b } from "../x/y";',
    "import { c } from './z.mjs';",
    "import { d } from '@comodeviaser/rte-theme';",
  ].join('\n');
  assert.equal(
    withMjsImports(js),
    [
      "import { a } from './model.mjs';",
      'import { b } from "../x/y.mjs";',
      "import { c } from './z.mjs';",
      "import { d } from '@comodeviaser/rte-theme';",
    ].join('\n'),
  );
});
