/** Modo de envio da página `/files` (spec 07b, W6). */
export type UploadMode = 'simulated' | 'server';

export interface DemoConfig {
  readonly upload: UploadMode;
}

/** Padrão: o build estático nunca envia nada (vale também no prerender e se o arquivo faltar). */
export const DEFAULT_DEMO_CONFIG: DemoConfig = { upload: 'simulated' };

/**
 * Token *bearer* de desenvolvimento do servidor de exemplo (`serve.mjs --with-server` e
 * `consumer.mjs dev` sobem o servidor com o mesmo valor em `AUTH_TOKEN`). Não é segredo.
 */
export const DEV_AUTH_TOKEN = 'demo-dev-token';

/** Lê o JSON de `demo-config.json`; qualquer coisa fora de `{"upload":"server"}` vale o padrão. */
export function parseDemoConfig(value: unknown): DemoConfig {
  if (
    typeof value === 'object' &&
    value !== null &&
    (value as { upload?: unknown }).upload === 'server'
  ) {
    return { upload: 'server' };
  }
  return DEFAULT_DEMO_CONFIG;
}

/** Busca `demo-config.json` (mesma origem); falha de rede ou JSON inválido vale o padrão. */
export async function loadDemoConfig(
  fetchFn: typeof fetch = fetch,
  url = '/demo-config.json',
): Promise<DemoConfig> {
  try {
    const response = await fetchFn(url, { cache: 'no-store' });
    if (!response.ok) return DEFAULT_DEMO_CONFIG;
    return parseDemoConfig(await response.json());
  } catch {
    return DEFAULT_DEMO_CONFIG;
  }
}
