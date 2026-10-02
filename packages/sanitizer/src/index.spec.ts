import { describe, expect, it } from 'vitest';
import { SANITIZER_VERSION } from './index';

describe('@cds/rte-sanitizer', () => {
  it('exports its version', () => {
    expect(SANITIZER_VERSION).toBe('0.0.0');
  });
});
