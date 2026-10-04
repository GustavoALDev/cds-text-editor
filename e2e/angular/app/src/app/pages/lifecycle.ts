import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RteEditor } from '@cds/rte-angular';
import { E2eBridge } from '../e2e-bridge';

/** N7: o editor entra e sai de um `@if` (`toggle('show')`). */
@Component({
  selector: 'app-lifecycle',
  imports: [RteEditor],
  templateUrl: './lifecycle.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifecyclePage {
  protected readonly bridge = inject(E2eBridge);
}
