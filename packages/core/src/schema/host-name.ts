/**
 * Caracteres que mudam o sentido de um host dentro de uma URL (userinfo,
 * caminho, porta, consulta, fragmento, percent-encoding) ou espaço. São
 * recusados antes de interpretar: para texto não ASCII a comparação de ida e
 * volta não vale, e `new URL('https://ü@evil.com/')` daria `evil.com`.
 */
const URL_DELIMITERS = /[/:@?#\\%\s]/;

/**
 * Host de configuração na forma comparável: ASCII (punycode), minúsculas,
 * sem ponto final; preserva o curinga `*.` (se permitido). Lança `TypeError` se não for um
 * nome de host.
 */
export function normalizeHost(
  option: string,
  host: unknown,
  allowWildcard: boolean,
): string {
  const fail = (): never => {
    throw new TypeError(`${option}: host "${String(host)}" inválido.`);
  };
  if (typeof host !== 'string') return fail();
  if (URL_DELIMITERS.test(host)) return fail();
  const wildcard = host.startsWith('*.');
  // Domínio bloqueado já cobre os subdomínios (seção 4.2); curinga deixaria o apex passar.
  if (!allowWildcard && host.includes('*')) return fail();
  const name = (wildcard ? host.slice(2) : host).replace(/\.$/, '');
  if (name === '') return fail();
  let parsed: string;
  try {
    parsed = new URL(`https://${name}/`).hostname.replace(/\.$/, '');
  } catch {
    return fail();
  }
  // ASCII precisa sair igual (só minúsculas): IPs abreviados como "127.1" são erro.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(name) && parsed !== name.toLowerCase())
    return fail();
  return wildcard ? `*.${parsed}` : parsed;
}
