import { describe, expect, it } from 'vitest';
import { orphanFiles, referencedFiles } from './orfas.example';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 10 * DAY;

describe('limpeza de órfãs no servidor', () => {
  const html =
    '<p>oi</p><img src="/media/a.png" alt="a">' +
    '<video src="/media/v.webm" poster="/media/p.jpg"></video>' +
    '<img src="/media/s-1.png" srcset="/media/s-1.png 1x, /media/s-2.png 2x" alt="s">';

  it('lê src, poster e cada URL do srcset', () => {
    expect([...referencedFiles([html])].sort()).toEqual([
      'a.png',
      'p.jpg',
      's-1.png',
      's-2.png',
      'v.webm',
    ]);
  });

  it('só apaga o que nenhum texto cita e já passou da carência', () => {
    const stored = [
      { name: 'a.png', mtimeMs: NOW - 5 * DAY }, // citado: fica
      { name: 'velho.png', mtimeMs: NOW - 5 * DAY }, // órfão antigo: sai
      { name: 'novo.png', mtimeMs: NOW - 1000 }, // órfão recente (ex.: desfazer): fica
    ];
    expect(orphanFiles(stored, [html], { now: NOW, graceMs: DAY })).toEqual([
      'velho.png',
    ]);
  });

  it('um arquivo citado por QUALQUER texto não é órfão', () => {
    const stored = [{ name: 'a.png', mtimeMs: 0 }];
    expect(
      orphanFiles(stored, ['<p>outro texto</p>', html], {
        now: NOW,
        graceMs: DAY,
      }),
    ).toEqual([]);
  });
});
