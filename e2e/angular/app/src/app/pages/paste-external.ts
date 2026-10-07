import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RteEditor } from '@cds/rte-angular';

/** N41 (spec 05c2b): colagem externa (URL → *embed*; imagens na Tarefa 5). */
@Component({
  selector: 'app-paste-external',
  imports: [RteEditor],
  templateUrl: './paste-external.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasteExternalPage {
  protected readonly value = signal('<p></p><p>Texto</p>');
}
