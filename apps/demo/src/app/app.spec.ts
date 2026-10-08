import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { NAV_ITEMS } from './nav';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';

describe('esqueleto do demo', () => {
  it('as 8 rotas do W5 existem e batem com a navegação', () => {
    expect(routes.map((r) => r.path)).toEqual(NAV_ITEMS.map((i) => i.path));
    expect(NAV_ITEMS.map((i) => i.path)).toEqual([
      '',
      'editor',
      'toolbar',
      'forms',
      'i18n',
      'files',
      'render',
      'theme',
    ]);
  });

  it('nenhuma rota usa os caminhos reservados ao servidor de exemplo', () => {
    const reserved = ['upload', 'csrf', 'media'];
    expect(routes.some((r) => reserved.includes(r.path ?? ''))).toBe(false);
  });

  it('toda rota é pré-renderizada', () => {
    expect(serverRoutes).toHaveLength(1);
    expect(serverRoutes[0]?.path).toBe('**');
  });

  it('a navegação lateral lista as 8 páginas e o conteúdo principal existe', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const links = el.querySelectorAll('nav a');
    expect([...links].map((a) => a.textContent?.trim())).toEqual(
      NAV_ITEMS.map((i) => i.label),
    );
    expect(el.querySelector('main#conteudo')).not.toBeNull();
  });

  it('as páginas carregam sob demanda (stubs com título)', async () => {
    for (const route of routes) {
      const load = route.loadComponent;
      expect(load, route.path).toBeTypeOf('function');
      const component = await (load as () => Promise<unknown>)();
      expect(component, route.path).toBeTypeOf('function');
    }
  });
});
