// Ajudante de testes (fora do build): extensão de prioridade alta cujo
// `appendTransaction` responde a uma transação marcada com `SHIFT_META`
// inserindo um parágrafo vazio no início do documento. Os plugins seguintes
// recebem o lote [transação marcada, inserção], com as posições da 1ª
// deslocadas no documento final.
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export const SHIFT_META = 'testShiftBatch';

export const ShiftBatch = Extension.create({
  name: 'testShiftBatch',
  priority: 1000,
  addProseMirrorPlugins: () => [
    new Plugin({
      appendTransaction(transactions, _old, state) {
        if (!transactions.some((tr) => tr.getMeta(SHIFT_META) === true)) {
          return null;
        }
        return state.tr.insert(0, state.schema.nodes['paragraph']!.create());
      },
    }),
  ],
});
