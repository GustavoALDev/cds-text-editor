// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workspacePath } from './testing-support/workspace';
import { RTE_ICONS, type RteIconName } from './toolbar/icons';
import { RTE_TOOLBAR_ITEMS, type RteToolbarItemId } from './toolbar/items';

const NAMES: RteIconName[] = [
  ...(Object.keys(RTE_TOOLBAR_ITEMS) as RteToolbarItemId[]).filter(
    (id): id is Exclude<RteToolbarItemId, 'blockType'> => id !== 'blockType',
  ),
  'alignLeft',
  'alignCenter',
  'alignRight',
  'alignJustify',
  'chevronDown',
  'check',
  'addRowAfter',
  'addColumnAfter',
  'deleteRow',
  'deleteColumn',
  'tableMore',
  'removeLink',
  'openLink',
  'imageAlignFull',
  'removeImage',
  'mediaDetails',
];

describe('RTE_ICONS', () => {
  it('tem o ícone mediaDetails (image/video/embed vêm com os ids da barra)', () => {
    expect(RTE_ICONS['mediaDetails'].length).toBeGreaterThan(0);
    expect(RTE_ICONS['mediaDetails'][0]).not.toBe('');
  });

  it('tem pelo menos um caminho para cada ícone', () => {
    expect(Object.keys(RTE_ICONS).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES)
      expect(RTE_ICONS[name].length, name).toBeGreaterThan(0);
  });

  it('só tem comandos de caminho SVG', () => {
    for (const name of NAMES)
      for (const d of RTE_ICONS[name])
        expect(d, name).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
  });

  it('é congelado', () => {
    expect(Object.isFrozen(RTE_ICONS)).toBe(true);
  });

  it('o arquivo cita Lucide, ISC e a versão', () => {
    const text = readFileSync(
      workspacePath('packages/angular/src/toolbar/icons.ts'),
      'utf8',
    );
    expect(text).toMatch(
      /Lucide \d+\.\d+\.\d+ \(https:\/\/lucide\.dev\), ISC License/,
    );
    expect(text).toContain(
      'Permission to use, copy, modify, and/or distribute',
    );
    expect(text).toContain('convertidos em caminhos');
  });
});
