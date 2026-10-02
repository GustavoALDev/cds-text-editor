import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('@cds/rte-core', () => {
  it('exports its version', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});
