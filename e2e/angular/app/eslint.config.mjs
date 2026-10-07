import nx from '@nx/eslint-plugin';
import baseConfig from '../../../eslint.config.mjs';

// App de teste da spec 05a (D22): só roda nos E2E de `e2e/angular/`.
export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
];
