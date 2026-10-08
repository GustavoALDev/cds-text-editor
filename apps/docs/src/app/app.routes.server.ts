import { RenderMode, type ServerRoute } from '@angular/ssr';
import { NAV } from '../generated/nav';

const paramsOf =
  (section: string, param: string) =>
  async (): Promise<Record<string, string>[]> =>
    NAV.flatMap((group) => group.items)
      .filter((item) => item.path.startsWith(`${section}/`))
      .map((item) => ({ [param]: item.path.slice(section.length + 1) }));

// Toda rota é pré-renderizada no build (`outputMode: 'static'`): as páginas do `nav.ts`, a
// raiz (redireciona) e a `**` (vira `404.html`).
export const serverRoutes: ServerRoute[] = [
  {
    path: 'guia/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: paramsOf('guia', 'slug'),
  },
  {
    path: 'api/:entry',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: paramsOf('api', 'entry'),
  },
  // O Angular 22.2.1 não gera `404.html` para a `**`: a rota `404` é pré-renderizada e o
  // `consumer.mjs` a copia para `404.html` (achado da 07c).
  { path: '404', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Prerender },
];
