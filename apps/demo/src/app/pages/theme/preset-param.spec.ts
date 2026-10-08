import { describe, expect, it } from 'vitest';
import { readPresetParam } from './preset-param';

const IDS = ['angular', 'ocean', 'forest', 'sunset', 'monochrome'] as const;

describe('readPresetParam', () => {
  it('devolve o id válido', () => {
    expect(readPresetParam('?preset=ocean', IDS)).toBe('ocean');
    expect(readPresetParam('preset=forest&x=1', IDS)).toBe('forest');
  });

  it.each([
    '',
    '?',
    '?preset=',
    '?preset=banana',
    '?preset=Ocean',
    '?preset=ocean&preset=forest',
    '?preset=__proto__',
    '?preset=constructor',
    '?preset=toString',
    '?outro=ocean',
  ])('ignora %j', (search) => {
    expect(readPresetParam(search, IDS)).toBeNull();
  });
});
