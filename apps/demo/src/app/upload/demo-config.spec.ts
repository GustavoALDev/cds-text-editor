import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEMO_CONFIG,
  loadDemoConfig,
  parseDemoConfig,
} from './demo-config';

const respond = (body: string, status = 200): typeof fetch =>
  vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;

describe('demo-config', () => {
  it('padrão simulated quando o JSON falta, é inválido ou diz outra coisa', async () => {
    expect(parseDemoConfig(null)).toEqual(DEFAULT_DEMO_CONFIG);
    expect(parseDemoConfig({ upload: 'x' })).toEqual({ upload: 'simulated' });
    expect(await loadDemoConfig(respond('', 404))).toEqual(DEFAULT_DEMO_CONFIG);
    expect(await loadDemoConfig(respond('não é json'))).toEqual(
      DEFAULT_DEMO_CONFIG,
    );
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await loadDemoConfig(offline)).toEqual(DEFAULT_DEMO_CONFIG);
  });

  it('server quando o JSON diz', async () => {
    expect(await loadDemoConfig(respond('{"upload":"server"}'))).toEqual({
      upload: 'server',
    });
  });
});
