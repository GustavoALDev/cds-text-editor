import { RenderMode, type ServerRoute } from '@angular/ssr';

// Toda rota é pré-renderizada no build (`outputMode: 'static'`).
export const serverRoutes: ServerRoute[] = [
  { path: '**', renderMode: RenderMode.Prerender },
];
