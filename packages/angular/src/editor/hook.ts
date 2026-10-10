/**
 * Gancho de teste (D23): o host do `rte-editor` recebe esta propriedade com o
 * `Editor` enquanto ele existe. `Symbol.for` vale entre bundles e em build de
 * produção; `getRteEditor` (entry `/testing`) a lê.
 */
export const RTE_EDITOR_HOOK = Symbol.for('@comodeviaser/rte-angular/editor');
