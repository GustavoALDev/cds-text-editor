import type { Type } from '@angular/core';
import type { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';
import { EXAMPLES } from '../../../examples/registry';
import { PAGES } from '../../generated/pages';

/** Item do sumário da página (h2/h3 do Markdown). */
export interface PageHeading {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
}

/** Trecho da página: HTML já checado pelo build (X4) ou um exemplo vivo do registro (X6). */
export type PageSegment = { readonly html: string } | { readonly live: string };

/** O módulo gerado por página (`tools/docs-content.mjs`, X3). */
export interface PageData {
  readonly title: string;
  readonly description?: string;
  readonly headings: readonly PageHeading[];
  readonly segments: readonly PageSegment[];
}

type PageLoader = () => Promise<{ default: PageData }>;

/** Id da página = caminho sem a base: `guia/inicio-rapido`, `api/rte-core`. */
export function pageId(route: ActivatedRouteSnapshot): string {
  return route.url.map((segment) => segment.path).join('/');
}

async function loadPage(
  route: ActivatedRouteSnapshot,
): Promise<PageData | null> {
  const load = (PAGES as Readonly<Record<string, PageLoader | undefined>>)[
    pageId(route)
  ];
  return load ? (await load()).default : null;
}

/** Carrega o módulo da página (um *chunk* por página); `null` se o id não existe. */
export const pageResolver: ResolveFn<PageData | null> = (route) =>
  loadPage(route);

/** Componentes dos exemplos vivos (`{ live }`) da página, por id do registro (X6). */
export type PageExamples = Readonly<Record<string, Type<unknown>>>;

export const examplesResolver: ResolveFn<PageExamples> = async (route) => {
  const page = await loadPage(route);
  const out: Record<string, Type<unknown>> = {};
  for (const segment of page?.segments ?? []) {
    if (!('live' in segment) || out[segment.live]) continue;
    const load = EXAMPLES[segment.live];
    if (!load)
      throw new Error(`exemplo vivo "${segment.live}" fora do registro`);
    out[segment.live] = await load();
  }
  return out;
};
