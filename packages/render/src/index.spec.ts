import { describe, expect, it } from 'vitest';
import { RENDER_VERSION } from './index';

describe('@cds/rte-render', () => {
  it('exports its version', () => {
    expect(RENDER_VERSION).toBe('0.0.0');
  });
});
