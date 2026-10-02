import { describe, expect, it } from 'vitest';
import { THEME_VERSION } from './index';

describe('@cds/rte-theme', () => {
  it('exports its version', () => {
    expect(THEME_VERSION).toBe('0.0.0');
  });
});
