import { describe, expect, it } from 'vitest';
import { ANGULAR_VERSION } from './index';

describe('@cds/rte-angular', () => {
  it('exports its version', () => {
    expect(ANGULAR_VERSION).toBe('0.0.0');
  });
});
