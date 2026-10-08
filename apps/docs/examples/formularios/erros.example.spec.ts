import { describe, expect, it } from 'vitest';
import { RTE_LABELS_EN } from '@cds/rte-angular/i18n';
import { mensagem } from './erros.example';

// Prova a tradução dos erros das diretivas pelo formatRteError (nada simulado).

describe('mensagem (formatRteError)', () => {
  it('traduz o erro de rteMaxChars com o limite e o tamanho atual', () => {
    const texto = mensagem({ rteMaxChars: { max: 60, actual: 120 } });
    expect(texto).toContain('60');
    expect(texto).toContain('120');
  });

  it('traduz rteRequired, rteMaxWords e rteEmptyHeadings', () => {
    expect(mensagem({ rteRequired: true })).not.toBe('');
    expect(mensagem({ rteMaxWords: { max: 5, actual: 9 } })).toContain('5');
    expect(mensagem({ rteEmptyHeadings: { count: 2 } })).not.toBe('');
  });

  it('usa o idioma pedido', () => {
    const pt = mensagem({ rteRequired: true });
    const en = mensagem({ rteRequired: true }, RTE_LABELS_EN);
    expect(en).not.toBe(pt);
  });

  it('devolve texto vazio sem erro ou com erro desconhecido', () => {
    expect(mensagem(null)).toBe('');
    expect(
      mensagem({ minlength: { requiredLength: 3, actualLength: 1 } }),
    ).toBe('');
  });
});
