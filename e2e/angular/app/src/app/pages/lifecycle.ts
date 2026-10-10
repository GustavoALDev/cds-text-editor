import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RteEditor, type RteEditorConfig } from '@comodeviaser/rte-angular';
import { E2eBridge } from '../e2e-bridge';

/** Documento pequeno do cenário completo (N46): texto, link, tabela e imagem. */
const FULL_DOCUMENT =
  '<p>Primeiro <a href="https://example.com/">link</a> com banana.</p>' +
  '<table><tbody><tr><th scope="col"><p>Nome</p></th><th scope="col"><p>Valor</p></th></tr>' +
  '<tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>' +
  '<figure class="rt-figure rt-figure--center"><img src="/e2e.png" alt="Imagem" loading="lazy" decoding="async"></figure>' +
  '<p>Fim</p>';

/**
 * N7: o editor entra e sai de um `@if` (`toggle('show')`). Com `?full` (N46,
 * spec 05d2) é o cenário completo sem formulário: barra `full`, menus,
 * `features.media`, contadores e `draftKey`; cada editor criado é contado por
 * `WeakRef` na ponte (`liveEditors`). Sem `[formField]` de propósito: o Signal
 * Forms segura o último `FormField` destruído até o próximo (achado da 05d2).
 */
@Component({
  selector: 'app-lifecycle',
  imports: [RteEditor],
  templateUrl: './lifecycle.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifecyclePage {
  protected readonly bridge = inject(E2eBridge);
  protected readonly full = new URLSearchParams(
    inject(DOCUMENT).location?.search ?? '',
  ).has('full');
  protected readonly options: RteEditorConfig = this.full
    ? { features: { media: true }, allowRelativeMedia: true }
    : {};
  protected readonly value = signal(this.full ? FULL_DOCUMENT : '');
}
