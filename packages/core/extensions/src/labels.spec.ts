import { describe, expect, it, vi } from 'vitest';
import { RTE_CONTENT_LABELS, resolveContentLabels } from './labels';

describe('RTE_CONTENT_LABELS', () => {
  it('pacotes pt-BR, en e es', () => {
    expect(RTE_CONTENT_LABELS['pt-BR'].calloutTitles).toEqual({
      info: 'Informação',
      success: 'Sucesso',
      warning: 'Atenção',
      danger: 'Perigo',
    });
    expect(RTE_CONTENT_LABELS['pt-BR'].readAlsoTitle).toBe('Leia também');
    expect(RTE_CONTENT_LABELS['pt-BR'].taskCheckbox('X')).toBe('Tarefa: X');
    expect(RTE_CONTENT_LABELS.en.calloutTitles).toEqual({
      info: 'Information',
      success: 'Success',
      warning: 'Warning',
      danger: 'Danger',
    });
    expect(RTE_CONTENT_LABELS.en.readAlsoTitle).toBe('Read also');
    expect(RTE_CONTENT_LABELS.en.taskCheckbox('X')).toBe('Task: X');
    expect(RTE_CONTENT_LABELS.es.calloutTitles).toEqual({
      info: 'Información',
      success: 'Éxito',
      warning: 'Atención',
      danger: 'Peligro',
    });
    expect(RTE_CONTENT_LABELS.es.readAlsoTitle).toBe('Lee también');
    expect(RTE_CONTENT_LABELS.es.taskCheckbox('X')).toBe('Tarea: X');
  });

  it('congelado em profundidade', () => {
    expect(Object.isFrozen(RTE_CONTENT_LABELS)).toBe(true);
    for (const pack of Object.values(RTE_CONTENT_LABELS)) {
      expect(Object.isFrozen(pack)).toBe(true);
      expect(Object.isFrozen(pack.calloutTitles)).toBe(true);
    }
  });
});

describe('resolveContentLabels', () => {
  it('sem fonte devolve en', () => {
    const labels = resolveContentLabels(undefined);
    expect(labels.calloutTitles).toEqual(RTE_CONTENT_LABELS.en.calloutTitles);
    expect(labels.readAlsoTitle).toBe('Read also');
    expect(labels.taskCheckbox('a')).toBe('Task: a');
  });

  it('mescla sobre en variante a variante', () => {
    const labels = resolveContentLabels({
      calloutTitles: { info: 'I' } as never,
    });
    expect(labels.calloutTitles.info).toBe('I');
    expect(labels.calloutTitles.danger).toBe('Danger');
    expect(labels.readAlsoTitle).toBe('Read also');
  });

  it('pacote inteiro substitui tudo', () => {
    const labels = resolveContentLabels(RTE_CONTENT_LABELS.es);
    expect(labels.calloutTitles.warning).toBe('Atención');
    expect(labels.readAlsoTitle).toBe('Lee también');
    expect(labels.taskCheckbox('a')).toBe('Tarea: a');
  });

  it('ignora chaves herdadas e valores que não são texto', () => {
    const titles = Object.create({ danger: 'herdado' }) as Record<
      string,
      unknown
    >;
    titles['info'] = 42;
    const labels = resolveContentLabels({
      calloutTitles: titles as never,
      readAlsoTitle: null as never,
    });
    expect(labels.calloutTitles.info).toBe('Information');
    expect(labels.calloutTitles.danger).toBe('Danger');
    expect(labels.readAlsoTitle).toBe('Read also');
  });

  it('fonte por função é chamada a cada resolução', () => {
    let title = 'A';
    const source = vi.fn(() => ({ readAlsoTitle: title }));
    expect(resolveContentLabels(source).readAlsoTitle).toBe('A');
    title = 'B';
    expect(resolveContentLabels(source).readAlsoTitle).toBe('B');
    expect(source).toHaveBeenCalledTimes(2);
  });
});
