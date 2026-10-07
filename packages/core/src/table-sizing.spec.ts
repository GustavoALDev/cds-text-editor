import { describe, expect, it } from 'vitest';
import {
  getTableSizing,
  parseColWidth,
  RTE_TABLE_CELL_MIN_WIDTH,
} from './table-sizing';

// Spec 06 (H20, R6): a página dimensiona a tabela como o `TableView` do Tiptap na edição.
describe('getTableSizing', () => {
  it('a largura mínima de célula é a padrão do Tiptap (25)', () => {
    expect(RTE_TABLE_CELL_MIN_WIDTH).toBe(25);
  });

  it('todas as colunas com largura → width = soma', () => {
    expect(getTableSizing([480, 480])).toEqual({ width: 960 });
    expect(getTableSizing([300])).toEqual({ width: 300 });
  });

  it('algumas com largura → minWidth = soma + mínimo × colunas sem largura', () => {
    expect(getTableSizing([200, null, null])).toEqual({ minWidth: 250 });
    expect(getTableSizing([null, 100])).toEqual({ minWidth: 125 });
  });

  it('nenhuma com largura (ou sem colunas) → null', () => {
    expect(getTableSizing([null, null])).toBeNull();
    expect(getTableSizing([])).toBeNull();
  });

  it('colspan: o colgroup tem um col por coluna (a célula de 2 colunas vira 2 entradas)', () => {
    // 1ª linha `<th colwidth="120,80" colspan="2">` + `<td>` sem largura → col 120, 80, —.
    expect(getTableSizing([120, 80, null])).toEqual({ minWidth: 225 });
    expect(getTableSizing([120, 80])).toEqual({ width: 200 });
  });

  it('mínimo customizado', () => {
    expect(getTableSizing([100, null], 40)).toEqual({ minWidth: 140 });
  });
});

describe('parseColWidth', () => {
  it('lê só px inteiro positivo; o resto é "sem largura"', () => {
    expect(parseColWidth('200px')).toBe(200);
    expect(parseColWidth(' 9999px ')).toBe(9999);
    for (const v of [
      '',
      'auto',
      '0px',
      '12.5px',
      '10%',
      '10em',
      null,
      undefined,
    ])
      expect(parseColWidth(v)).toBeNull();
  });
});
