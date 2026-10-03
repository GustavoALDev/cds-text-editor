import type {
  RteAttrRule,
  RteAttrSpec,
  RteElementSpec,
  RteHtmlSchema,
  RteUrlRule,
} from './types';

// Gera docs/html-schema.md a partir do esquema. A saída já é estável sob o
// Prettier (tabelas com colunas alinhadas), para o repositório poder formatar
// a pasta docs sem criar diferença.

const TITLES: Record<string, string> = {
  base: 'Base',
  links: 'Links',
  colors: 'Cores',
  code: 'Código',
  tables: 'Tabelas',
  tasks: 'Tarefas',
  media: 'Mídia',
  embeds: 'Embeds',
  newsBlocks: 'Blocos de notícia',
};

const code = (s: string): string => `\`${s}\``;

function urlRule(r: RteUrlRule): string {
  const parts = [r.schemes.join(', ')];
  if (r.relative) parts.push('relativo');
  if (r.fragment) parts.push('fragmento');
  if (r.hosts) parts.push(`hosts: ${r.hosts.join(', ')}`);
  if (r.blockedHosts) parts.push(`bloqueados: ${r.blockedHosts.join(', ')}`);
  if (r.patterns) parts.push(`padrões: ${r.patterns.join(' ')}`);
  parts.push(`até ${r.maxLength}`);
  return `url (${parts.join('; ')})`;
}

function ruleSummary(r: RteAttrRule): string {
  switch (r.kind) {
    case 'enum':
      return `enum: ${r.values.join(' | ')}`;
    case 'pattern':
      return `padrão: ${r.pattern} (até ${r.maxLength})`;
    case 'int':
      return `int ${r.min}–${r.max}`;
    case 'bool':
      return 'booleano';
    case 'text':
      return `texto (até ${r.maxLength})`;
    case 'url':
      return urlRule(r);
    case 'srcset':
      return `srcset (até ${r.maxLength}; cada URL: ${urlRule(r.url)})`;
    case 'tokens':
      return `tokens (${r.values.join(r.separator.trim() === ';' ? ' ; ' : ' ')}; separador ${code(r.separator)}; até ${r.maxLength})`;
  }
}

function attrLine(name: string, spec: RteAttrSpec): string {
  let text = `${name}: ${ruleSummary(spec.rule)}`;
  if (spec.required) text += ' [obrigatório]';
  if (spec.default !== undefined) text += ` [padrão: ${spec.default}]`;
  return code(text);
}

function cell(lines: string[]): string {
  return lines.length === 0
    ? '—'
    : lines.map((l) => l.replaceAll('|', String.raw`\|`)).join('<br>');
}

function attributeLines(spec: RteElementSpec): string[] {
  const lines = Object.entries(spec.attributes).map(([n, s]) => attrLine(n, s));
  if (spec.styleFrom) {
    const map = Object.entries(spec.styleFrom.map)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(
      code(
        `estilo derivado de ${spec.styleFrom.attribute} em ${spec.styleFrom.property} (${map})`,
      ),
    );
  }
  if (spec.requireChild)
    lines.push(code(`filho exigido: ${spec.requireChild.join(', ')}`));
  if (spec.onInvalid)
    lines.push(
      code(
        `se inválido: ${spec.onInvalid === 'remove' ? 'remove' : 'desembrulha'}`,
      ),
    );
  for (const e of spec.ensureTokens ?? []) {
    const when = e.when ? ` quando ${e.when.attribute}=${e.when.equals}` : '';
    lines.push(code(`garante em ${e.attribute}: ${e.tokens.join(' ')}${when}`));
  }
  return lines;
}

function classLines(spec: RteElementSpec): string[] {
  return [
    ...(spec.classes?.values ?? []).map(code),
    ...(spec.classes?.patterns ?? []).map((p) => code(`padrão: ${p}`)),
  ];
}

function styleLines(spec: RteElementSpec): string[] {
  return Object.entries(spec.styles ?? {}).map(([p, r]) =>
    code(`${p}: ${ruleSummary(r)}`),
  );
}

/** Tabela Markdown com colunas alinhadas, igual à formatação do Prettier. */
function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) =>
    Math.max(3, h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const fmt = (r: string[]) =>
    `| ${r.map((c, i) => c.padEnd(widths[i] ?? 3)).join(' | ')} |`;
  return [
    fmt(header),
    `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`,
    ...rows.map(fmt),
  ];
}

/** Markdown (pt-BR) do esquema: uma seção por recurso e as paletas. Determinístico. */
export function renderHtmlSchemaMarkdown(schema: RteHtmlSchema): string {
  const out: string[] = [
    '# Esquema de HTML aceito',
    '',
    '> Arquivo gerado — não edite à mão; regenere com `UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache`.',
    '',
    `Versão do esquema: ${schema.version}. Prefixo de classes e ids: ${code(schema.idPrefix)}. Recursos: ${schema.features.map(code).join(', ')}.`,
    '',
  ];
  for (const [feature, tags] of Object.entries(schema.byFeature)) {
    out.push(`## ${TITLES[feature] ?? feature}`, '');
    const rows = (tags ?? []).map((tag) => {
      const spec = schema.elements[tag] ?? { attributes: {} };
      return [
        code(`<${tag}>`),
        cell(attributeLines(spec)),
        cell(classLines(spec)),
        cell(styleLines(spec)),
      ];
    });
    out.push(...table(['Tag', 'Atributos', 'Classes', 'Estilos'], rows), '');
  }
  const palettes: [string, typeof schema.palette.text][] = [
    ['Paleta de texto', schema.palette.text],
    ['Paleta de marca-texto', schema.palette.highlight],
  ];
  for (const [title, colors] of palettes) {
    out.push(`## ${title}`, '');
    out.push(
      ...table(
        ['Nome', 'Claro', 'Escuro'],
        colors.map((c) => [c.name, code(c.light), code(c.dark)]),
      ),
      '',
    );
  }
  return `${out.join('\n').trimEnd()}\n`;
}
