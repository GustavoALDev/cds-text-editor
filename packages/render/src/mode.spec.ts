import { NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RTE_TEST_MODE } from './testing-support/test-mode';

// `test` roda zoneless e `test-zone` com zone.js (pré-voo 2): o modo
// marcado pelo providersFile tem de bater com o ambiente real.
describe('modo de detecção de mudanças da suíte', () => {
  it('o ambiente corresponde ao modo marcado (zoneless sem Zone, zone com NgZone)', () => {
    const mode = TestBed.inject(RTE_TEST_MODE);
    const hasZone =
      typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';
    const inAngularZone = TestBed.inject(NgZone).run(() =>
      NgZone.isInAngularZone(),
    );

    if (mode === 'zoneless') {
      expect(hasZone).toBe(false);
      expect(inAngularZone).toBe(false);
    } else {
      expect(mode).toBe('zone');
      expect(hasZone).toBe(true);
      expect(inAngularZone).toBe(true);
    }
  });
});
