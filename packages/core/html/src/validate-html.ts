import { Parser } from 'htmlparser2';
import { isAllowedClass } from '../../src/schema/classes';
import { normalizeAttribute } from '../../src/schema/rules';
import { applyStyleFrom, sanitizeStyle } from '../../src/schema/style';
import type {
  RteAttrRule,
  RteElementSpec,
  RteHtmlSchema,
} from '../../src/schema/types';
import { resolveMaxDepth } from './walk';

export type RteHtmlViolation = {
  kind:
    | 'unknown-element'
    | 'unknown-attribute'
    | 'invalid-attribute'
    | 'non-canonical-attribute'
    | 'missing-required-attribute'
    | 'invalid-class'
    | 'invalid-style'
    | 'missing-ensured-token'
    | 'missing-required-child'
    | 'unexpected-node'
    | 'max-depth';
  tag: string;
  name?: string;
  value?: string;
  path: string;
};

export interface ValidateHtmlOptions {
  /** `canonical` (padrão): igual à saída do sanitizador; `accepted`: só aceito. */
  mode?: 'canonical' | 'accepted';
  /** Padrão 256. */
  maxDepth?: number;
}

interface Frame {
  tag: string;
  spec: RteElementSpec | undefined;
  path: string;
  /** Quantos elementos filhos já foram abertos (índice do próximo irmão). */
  childCount: number;
  childTags: Set<string>;
}

/** Busca própria (nunca no protótipo): `undefined` se a chave não existe. */
function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** `tokens`: algum token informado fora de `values` (não pode ser descartado). */
function hasUnknownToken(rule: RteAttrRule, value: string): boolean {
  if (rule.kind !== 'tokens') return false;
  const known = new Set(rule.values.map((v) => v.toLowerCase()));
  return (rule.separator === ' ' ? value.split(ASCII_WS) : value.split(';'))
    .map((x) => x.trim().toLowerCase())
    .some((x) => x !== '' && !known.has(x));
}

const ASCII_WS = /[ \t\n\r\f]+/;
const TEXTLESS = new Set(['script', 'style']);

function splitTokens(value: string): string[] {
  return value.split(ASCII_WS).filter((t) => t !== '');
}

/** Conta as declarações não vazias de um `style`. */
function countDeclarations(style: string): number {
  return style.split(';').filter((d) => d.trim() !== '').length;
}

function checkStyle(
  spec: RteElementSpec,
  value: string,
  attrs: Map<string, string>,
  canonical: boolean,
): boolean {
  if (spec.styleFrom) {
    // O `style` é regenerado a partir do atributo da paleta: só o canonical confere.
    if (!canonical) return true;
    const source = attrs.get(spec.styleFrom.attribute);
    if (source === undefined) return false;
    return applyStyleFrom(spec.styleFrom, source) === value;
  }
  if (!spec.styles) return false;
  const sanitized = sanitizeStyle(spec.styles, value);
  if (sanitized === '') return false;
  if (canonical) return sanitized === value;
  return countDeclarations(sanitized) === countDeclarations(value);
}

/**
 * Valida o HTML contra o esquema, sem DOM. Devolve uma violação por problema
 * encontrado (lista vazia = conforme). `path` é a cadeia `tag[i]` do topo até o
 * elemento, com `i` = índice entre os elementos irmãos.
 */
export function validateHtml(
  html: string,
  schema: RteHtmlSchema,
  options: ValidateHtmlOptions = {},
): RteHtmlViolation[] {
  const canonical = (options.mode ?? 'canonical') === 'canonical';
  const maxDepth = resolveMaxDepth(options.maxDepth);
  const out: RteHtmlViolation[] = [];
  const root: Frame = {
    tag: '',
    spec: undefined,
    path: '',
    childCount: 0,
    childTags: new Set(),
  };
  const stack: Frame[] = [root];
  let stopped = false;
  let current = new Map<string, string>();

  const top = (): Frame => stack[stack.length - 1] ?? root;

  function checkElement(
    frame: Frame,
    spec: RteElementSpec,
    attrs: Map<string, string>,
  ): void {
    const { tag, path } = frame;
    const report = (
      kind: RteHtmlViolation['kind'],
      name?: string,
      value?: string,
    ): void => {
      const v: RteHtmlViolation = { kind, tag, path };
      if (name !== undefined) v.name = name;
      if (value !== undefined) v.value = value;
      out.push(v);
    };

    for (const [name, value] of attrs) {
      if (name === 'class') {
        const tokens = splitTokens(value);
        for (const token of tokens) {
          if (!isAllowedClass(spec, token))
            report('invalid-class', name, token);
        }
        // Forma canônica: não vazio, sem repetição, separado por um espaço.
        if (
          canonical &&
          (tokens.length === 0 ||
            new Set(tokens).size !== tokens.length ||
            tokens.join(' ') !== value)
        ) {
          report('invalid-class', name, value);
        }
        continue;
      }
      if (name === 'style') {
        if (!(spec.styles || spec.styleFrom)) {
          report('unknown-attribute', name, value);
        } else if (!checkStyle(spec, value, attrs, canonical)) {
          report('invalid-style', name, value);
        }
        continue;
      }
      const attrSpec = own(spec.attributes, name);
      if (!attrSpec) {
        report('unknown-attribute', name, value);
        continue;
      }
      const normalized = normalizeAttribute(attrSpec.rule, value);
      if (normalized === null || hasUnknownToken(attrSpec.rule, value)) {
        report('invalid-attribute', name, value);
      } else if (canonical && normalized !== value) {
        report('non-canonical-attribute', name, value);
      }
    }

    // O `style` do styleFrom é regenerado: no canonical ele precisa existir.
    if (canonical && spec.styleFrom && !attrs.has('style')) {
      const source = attrs.get(spec.styleFrom.attribute);
      if (
        source !== undefined &&
        applyStyleFrom(spec.styleFrom, source) !== null
      ) {
        report('invalid-style', 'style');
      }
    }

    for (const [name, attrSpec] of Object.entries(spec.attributes)) {
      if (attrSpec.required && !attrs.has(name)) {
        report('missing-required-attribute', name);
      }
    }

    // Valor do atributo já normalizado pela própria regra (`null` = ausente/inválido).
    const normalizedValue = (name: string): string | null => {
      const raw = attrs.get(name);
      if (raw === undefined) return null;
      const attrSpec = own(spec.attributes, name);
      return attrSpec ? normalizeAttribute(attrSpec.rule, raw) : raw;
    };

    for (const ensure of spec.ensureTokens ?? []) {
      if (ensure.when) {
        const w = ensure.when;
        if (normalizedValue(w.attribute) !== w.equals) continue;
      }
      const value = normalizedValue(ensure.attribute) ?? '';
      const rule = own(spec.attributes, ensure.attribute)?.rule;
      const separator = rule?.kind === 'tokens' ? rule.separator : ' ';
      const present = new Set(
        value
          .split(separator === ' ' ? ASCII_WS : ';')
          .map((x) => x.trim())
          .filter((x) => x !== ''),
      );
      const missing = ensure.tokens.filter((token) => !present.has(token));
      if (missing.length > 0) {
        report('missing-ensured-token', ensure.attribute, missing.join(' '));
      }
    }
  }

  const parser: Parser = new Parser(
    {
      onopentagname() {
        current = new Map();
      },
      onattribute(name, value) {
        // Primeiro vence (como no parser); Map não perde `__proto__`.
        if (!current.has(name)) current.set(name, value);
      },
      onopentag(name) {
        if (stopped) return;
        const attrs = current;
        const parent = top();
        const prefix = parent.path ? `${parent.path}>` : '';
        const path = `${prefix}${name}[${parent.childCount}]`;
        if (stack.length > maxDepth) {
          stopped = true;
          out.push({ kind: 'max-depth', tag: name, path });
          parser.pause();
          return;
        }
        parent.childCount++;
        parent.childTags.add(name);
        const spec = own(schema.elements, name);
        const frame: Frame = {
          tag: name,
          spec,
          path,
          childCount: 0,
          childTags: new Set(),
        };
        stack.push(frame);
        if (spec) checkElement(frame, spec, attrs);
        else out.push({ kind: 'unknown-element', tag: name, path });
      },
      onclosetag() {
        if (stopped || stack.length <= 1) return;
        const frame = stack.pop() as Frame;
        // `requireChild` é "um dos": o esquema une as listas dos recursos ativos
        // (ex.: `figure` = img | video | iframe | blockquote).
        const required = frame.spec?.requireChild;
        if (required && !required.some((c) => frame.childTags.has(c))) {
          out.push({
            kind: 'missing-required-child',
            tag: frame.tag,
            name: required.join(','),
            path: frame.path,
          });
        }
      },
      ontext() {
        if (stopped) return;
        const frame = top();
        if (TEXTLESS.has(frame.tag)) {
          out.push({
            kind: 'unexpected-node',
            tag: frame.tag,
            path: frame.path,
          });
        }
      },
      oncomment() {
        if (!stopped) {
          out.push({
            kind: 'unexpected-node',
            tag: '#comment',
            path: top().path,
          });
        }
      },
      onprocessinginstruction() {
        if (!stopped) {
          out.push({
            kind: 'unexpected-node',
            tag: '#doctype',
            path: top().path,
          });
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(String(html));
  if (!stopped) parser.end();
  return out;
}
