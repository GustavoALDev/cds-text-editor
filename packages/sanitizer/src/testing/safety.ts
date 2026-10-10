// Verificador executável de R5 ("nunca executável", spec 04): relê a saída
// com o `htmlparser2`, de forma independente da engine, e lista o que nela
// poderia executar. Só para testes (fora do build).
import {
  getElementSpec,
  isAllowedUrl,
  type RteHtmlSchema,
} from '@comodeviaser/rte-core';
import { Parser } from 'htmlparser2';

/** Esquemas de URL aceitos na saída (R5). */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set([
  'https:',
  'http:',
  'mailto:',
  'tel:',
]);

/**
 * Atributos que carregam URL em algum elemento do HTML (navegação, envio,
 * recurso ou SVG); todos são conferidos, estejam ou não no esquema.
 */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'src',
  'poster',
  'action',
  'formaction',
  'data',
  'xlink:href',
  'background',
  'codebase',
  'cite',
  'ping',
]);

/** Funções CSS que carregam URL (as mesmas que o `validateHtml` recusa). */
const STYLE_URL_FUNCTIONS = ['url(', 'image-set(', 'src('] as const;

/** Base para resolver URLs relativas: só o esquema importa. */
const BASE = 'https://base.test/';

/** Atributos de `iframe` que precisam ficar iguais ao `default` do esquema. */
const IFRAME_FIXED = ['sandbox', 'allow', 'referrerpolicy'] as const;

/** Protocolo de `value` resolvido contra `BASE`, ou `null` se não for URL. */
function protocolOf(value: string): string | null {
  try {
    return new URL(value, BASE).protocol;
  } catch {
    return null;
  }
}

/**
 * Candidatos de um `srcset`, de forma conservadora: cada trecho entre
 * vírgulas, até o primeiro espaço. Uma URL com vírgula vira dois trechos,
 * e os dois são conferidos.
 */
function srcsetUrls(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().split(/[ \t\n\r\f]+/)[0] ?? '')
    .filter((url) => url !== '');
}

/**
 * Lista os problemas de R5 em `html` (`[]` = seguro): elemento fora do
 * esquema, atributo `on*` ou `srcdoc`, URL (`URL_ATTRIBUTES` e candidatos de
 * `srcset`) com esquema fora de `https`/`http`/`mailto`/`tel`, `style` com
 * `url(`, `image-set(`, `src(`, `expression` ou `\`, `iframe` com conteúdo, com `sandbox`/`allow`/
 * `referrerpolicy` diferentes do `default` ou com `src` recusado pela regra.
 * Comentário, *doctype*, PI e CDATA também contam como problema.
 */
export function findUnsafe(html: string, schema: RteHtmlSchema): string[] {
  const problems: string[] = [];
  /** Tags abertas, para saber se há um `iframe` aberto. */
  const open: string[] = [];
  let attributes: [string, string][] = [];

  const insideIframe = (): boolean => open.includes('iframe');

  const checkIframe = (attrs: ReadonlyMap<string, string>): void => {
    const spec = getElementSpec(schema, 'iframe');
    if (!spec) return;
    for (const name of IFRAME_FIXED) {
      const expected = Object.hasOwn(spec.attributes, name)
        ? spec.attributes[name]?.default
        : undefined;
      if (attrs.get(name) !== expected) {
        problems.push(`<iframe> com ${name}="${attrs.get(name) ?? ''}"`);
      }
    }
    const rule = Object.hasOwn(spec.attributes, 'src')
      ? spec.attributes['src']?.rule
      : undefined;
    const src = attrs.get('src');
    if (
      rule?.kind !== 'url' ||
      src === undefined ||
      isAllowedUrl(rule, src) === null
    ) {
      problems.push(`<iframe> com src fora da regra: ${src ?? '(ausente)'}`);
    }
  };

  const parser = new Parser(
    {
      onopentagname() {
        attributes = [];
      },
      onattribute(name, value) {
        attributes.push([name, value]);
      },
      onopentag(tag) {
        const attrs = attributes;
        attributes = [];
        if (insideIframe()) problems.push(`<${tag}> dentro de <iframe>`);
        if (!getElementSpec(schema, tag)) {
          problems.push(`<${tag}> fora do esquema`);
        }
        for (const [name, value] of attrs) {
          if (/^on/i.test(name) || name === 'srcdoc') {
            problems.push(`<${tag}> com ${name}`);
          }
          if (URL_ATTRIBUTES.has(name)) {
            const protocol = protocolOf(value);
            if (protocol === null || !SAFE_PROTOCOLS.has(protocol)) {
              problems.push(`<${tag}> com ${name}="${value}"`);
            }
          }
          if (name === 'srcset') {
            for (const url of srcsetUrls(value)) {
              const protocol = protocolOf(url);
              if (protocol === null || !SAFE_PROTOCOLS.has(protocol)) {
                problems.push(`<${tag}> com candidato de srcset "${url}"`);
              }
            }
          }
          if (name === 'style') {
            const style = value.toLowerCase();
            if (
              STYLE_URL_FUNCTIONS.some((fn) => style.includes(fn)) ||
              style.includes('expression') ||
              style.includes('\\')
            ) {
              problems.push(`<${tag}> com style="${value}"`);
            }
          }
        }
        if (tag === 'iframe') {
          // Com nome repetido, vale o primeiro (como no parser).
          const byName = new Map<string, string>();
          for (const [name, value] of attrs) {
            if (!byName.has(name)) byName.set(name, value);
          }
          checkIframe(byName);
        }
        open.push(tag);
      },
      onclosetag(tag) {
        const index = open.lastIndexOf(tag);
        if (index !== -1) open.length = index;
      },
      ontext(text) {
        if (insideIframe()) problems.push(`texto dentro de <iframe>: ${text}`);
      },
      oncomment(text) {
        problems.push(`comentário: ${text}`);
      },
      oncdatastart() {
        problems.push('CDATA');
      },
      onprocessinginstruction(name) {
        problems.push(`instrução de processamento: ${name}`);
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return problems;
}
