import { Location, PlatformLocation } from '@angular/common';
import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import { RTE_RENDER_OPTIONS } from './provide';

/**
 * Caminho do documento para os links de fragmento (H6, H11, pré-voo 6):
 * `pathname + search` do `PlatformLocation` (o do servidor no SSR; o `pathname`
 * com uma só barra inicial), ou `null` com `fragmentLinks: 'keep'`.
 * Acompanha a navegação por
 * `Location.onUrlChange` (desregistrado com o `DestroyRef` de quem chama);
 * como é uma *string*, mudar só o *hash* não muda o valor e nada é
 * re-inserido (Review Focus 2). Chamar em contexto de injeção.
 */
export function injectFragmentBase(): Signal<string | null> {
  if (inject(RTE_RENDER_OPTIONS).fragmentLinks === 'keep') {
    return signal(null).asReadonly();
  }
  const platform = inject(PlatformLocation);
  // Barras iniciais repetidas (`//host/x`, `/\host`) colapsadas: senão a base vira
  // um link protocolo-relativo para outro *host* (revisão final, 1.4).
  const read = (): string =>
    '/' + platform.pathname.replace(/^[/\\]+/, '') + platform.search;
  const base = signal(read());
  const unregister = inject(Location).onUrlChange(() => base.set(read()));
  inject(DestroyRef).onDestroy(unregister);
  return base.asReadonly();
}
