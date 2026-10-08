import { describe, expect, it } from 'vitest';
import { verificarTema } from './checar';

// Prova a guarda com o checkRteTheme real: sementes válidas passam; cor inválida reprova.

describe('verificarTema (checkRteTheme)', () => {
  it('aprova sementes válidas', () => {
    const v = verificarTema({ primary: '#0369a1', secondary: '#0e7490' });
    expect(v.aprovado).toBe(true);
    expect(v.invalidas).toEqual([]);
    expect(v.reprovadas).toEqual([]);
  });

  it('aprova até uma cor clara: o contraste vem da derivação', () => {
    expect(verificarTema({ primary: '#ffff00' }).aprovado).toBe(true);
  });

  it('reprova uma semente que não é cor CSS e diz qual', () => {
    const v = verificarTema({ primary: 'banana' });
    expect(v.aprovado).toBe(false);
    expect(v.invalidas).toEqual(['primary']);
  });
});
