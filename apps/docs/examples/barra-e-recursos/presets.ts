// #region barra
import { Component } from '@angular/core';
import { RteEditor, type RteToolbarGroups } from '@comodeviaser/rte-angular';

// Grupos próprios: listas de ids na ordem de exibição (cada lista vira um grupo).
const GRUPOS: RteToolbarGroups = [
  ['undo', 'redo'],
  ['bold', 'italic', 'link'],
  ['bulletList', 'orderedList'],
];

@Component({
  selector: 'docs-toolbar-examples',
  imports: [RteEditor],
  template: `
    <rte-editor toolbar="full" ariaLabel="Preset full" />
    <rte-editor [toolbar]="groups" ariaLabel="Grupos próprios" />
    <rte-editor [toolbar]="false" ariaLabel="Sem barra" />
  `,
})
export class ToolbarExamples {
  protected readonly groups = GRUPOS;
}
// #endregion
