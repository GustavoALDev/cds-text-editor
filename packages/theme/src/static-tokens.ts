/** Tokens estáticos (semânticos e de código) por modo; chaves sem o prefixo `--rte-`. */
export const STATIC_TOKENS = {
  light: {
    danger: '#b3261e',
    warning: '#8c5a00',
    success: '#1b7a3a',
    'code-bg': '#f4f4f6',
    'code-text': '#24242b',
    'code-comment': '#5c5c6b',
    'code-keyword': '#6b21a8',
    'code-string': '#0f6a3a',
    'code-number': '#b45309',
    'code-function': '#1d4ed8',
  },
  dark: {
    danger: '#ff8f87',
    warning: '#f0b84d',
    success: '#5fd08a',
    'code-bg': '#1e1e24',
    'code-text': '#e8e8ee',
    'code-comment': '#9a9aab',
    'code-keyword': '#d2a8ff',
    'code-string': '#7ee0a1',
    'code-number': '#ffb86b',
    'code-function': '#8ab4ff',
  },
} as const satisfies Record<'light' | 'dark', Record<string, string>>;
