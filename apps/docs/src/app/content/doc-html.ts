import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';

/**
 * Único lugar do site que confia em HTML (spec 07c, X4): o conteúdo vem do repositório, passa
 * pela checagem do `docs-content` no build e o sanitizador do Angular tiraria os `id` das
 * âncoras. A regra `bypassSecurityTrust*` do `check:rules` restringe a chamada a este arquivo.
 * Cliques primários, sem modificador, em links internos navegam pelo *router* (X7).
 */
@Component({
  selector: 'docs-html',
  templateUrl: './doc-html.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { '(click)': 'onClick($event)' },
})
export class DocHtml {
  readonly html = input.required<string>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly safe = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.html()),
  );

  protected onClick(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest('a[href]');
    if (
      !anchor ||
      anchor.hasAttribute('target') ||
      anchor.hasAttribute('download')
    ) {
      return;
    }
    const url = internalUrl(
      anchor.getAttribute('href') ?? '',
      this.document.baseURI,
    );
    if (url === null) return;
    event.preventDefault();
    void this.router.navigateByUrl(url);
  }
}

/** Primeiros segmentos das rotas do site (`app.routes.ts`). */
const ROUTER_ROOTS = new Set(['guia', 'api', '404']);

/**
 * Caminho do *router* (sem a base) para um `href` interno, ou `null` se o link sai do site ou
 * da base. O `href` é relativo à base (X7): resolve contra o `baseURI`.
 */
export function internalUrl(href: string, baseUri: string): string | null {
  let target: URL;
  let base: URL;
  try {
    base = new URL(baseUri);
    target = new URL(href, base);
  } catch {
    return null;
  }
  if (target.origin !== base.origin) return null;
  const prefix = base.pathname.endsWith('/')
    ? base.pathname
    : `${base.pathname}/`;
  if (!target.pathname.startsWith(prefix) && `${target.pathname}/` !== prefix) {
    return null;
  }
  const rest = target.pathname.slice(prefix.length);
  // Só o que o router do site resolve; o resto (o demo, por exemplo) é do navegador.
  if (rest !== '' && !ROUTER_ROOTS.has(rest.split('/')[0])) return null;
  return `/${rest}${target.search}${target.hash}`;
}
