import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { clearLocalDrafts, RteEditor } from '@cds/rte-angular';

/** N39 (spec 05c2b): editor com `draftKey` e o botão de `clearLocalDrafts`. */
@Component({
  selector: 'app-draft',
  imports: [RteEditor],
  templateUrl: './draft.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftPage {
  protected readonly value = signal('');
  protected readonly cleared = signal<number | null>(null);

  protected clear(): void {
    this.cleared.set(clearLocalDrafts());
  }
}
