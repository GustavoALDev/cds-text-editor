// Conversor Markdown -> segmentos de HTML do site (spec 07c, X3/X4/X6/X7).
// `marked` + realce do `highlight.js` (só classes `hljs-*`); HTML cru só numa lista fechada;
// tudo o que sai passa por `safety.mjs`. Funções puras: o orquestrador é `tools/docs-content.mjs`.
import { posix } from 'node:path';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { Marked } from 'marked';
import {
  expandDirectives,
  LIVE_CLOSE,
  LIVE_OPEN,
  OK_MARK,
} from './directives.mjs';
import { assertSafeHtml } from './safety.mjs';
import { slug } from './slug.mjs';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

const LANG_ALIAS = {
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  html: 'xml',
  xml: 'xml',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  json: 'json',
  css: 'css',
};

/** HTML cru aceito no Markdown (X4); o resto é escapado. */
export const RAW_TAGS = [
  'b',
  'i',
  'em',
  'strong',
  'code',
  'br',
  'p',
  'sup',
  'sub',
  'kbd',
];
/** O Markdown do api-documenter usa tabelas em HTML. */
export const API_RAW_TAGS = [
  ...RAW_TAGS,
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

export const escapeHtml = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Remove os comentários HTML como o navegador os lê (`<!-->`, `<!--->`, `--!>` e comentário sem
 * fim incluídos), menos o marcador de exemplo vivo. Um comentário que o navegador fecha antes do
 * que um regex ingênuo esconde marcação ativa depois dele.
 */
export function stripComments(text) {
  return text.replace(/<!--(?!@@live:)(?:-?>|[\s\S]*?(?:--!?>|$))/g, '');
}

/** Mantém o marcador de exemplo vivo e as tags da lista (sem atributos); escapa o resto. */
export function escapeRawHtml(text, allowed) {
  return stripComments(text).replace(
    /<!--@@live:[\w.-]+@@-->|<\/?([a-zA-Z][\w-]*)([^<>]*)>|</g,
    (m, name, attrs) => {
      if (m.startsWith('<!--')) return m;
      if (
        name &&
        allowed.includes(name.toLowerCase()) &&
        !attrs.replace(/\/$/, '').trim()
      )
        return m;
      return m.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
  );
}

function highlight(code, lang) {
  const name = LANG_ALIAS[lang.toLowerCase()];
  if (!name)
    return `<pre><code class="hljs language-text">${escapeHtml(code)}</code></pre>`;
  const html = hljs.highlight(code, {
    language: name,
    ignoreIllegals: true,
  }).value;
  return `<pre><code class="hljs language-${escapeHtml(lang)}">${html}</code></pre>`;
}

const plain = (tokens) =>
  tokens
    .map((t) => (t.tokens ? plain(t.tokens) : (t.text ?? t.raw ?? '')))
    .join('');

/** Ids que o layout do site já usa (`app.html`, `search-box`): um título não pode tomá-los. */
const RESERVED_IDS = /^(conteudo|docs-search-.*)$/;

const EXPLICIT_ID = /\s*\{#([A-Za-z][\w.:-]*)\}\s*$/;

/** Reescreve um `href` do Markdown para a forma relativa à base do site (X7). */
export function rewriteHref(href, pageId) {
  if (href.startsWith('#')) return `${pageId}${href}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return href;
  const [pathPart, hash = ''] = href.split(/(?=#)/);
  if (!pathPart.endsWith('.md')) return href;
  const dir = posix.dirname(pageId);
  const target = posix.normalize(posix.join(dir, pathPart.slice(0, -3)));
  if (target.startsWith('..') || target.startsWith('/'))
    throw new Error(`${pageId}: o link "${href}" sai de apps/docs/content`);
  return `${target}${hash}`;
}

/**
 * Converte Markdown em HTML. Devolve { html, headings, links }.
 * - h1 inicial é descartado (o layout mostra o título); h2/h3 ganham `id` (slug ASCII único ou
 *   `{#id}` explícito) e entram em `headings`; h4+ só têm `id` se explícito.
 * - opções: { pageId, api } (`api` aceita as tabelas HTML do api-documenter).
 */
export function convertMarkdown(markdown, { pageId, api = false }) {
  const allowed = api ? API_RAW_TAGS : RAW_TAGS;
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(markdown);
  const ids = new Map();
  const headings = [];
  const taken = new Map();
  let h1 = false;
  for (const t of tokens) {
    if (t.type !== 'heading') continue;
    const explicit = EXPLICIT_ID.exec(t.text);
    const text = plain(t.tokens).replace(EXPLICIT_ID, '').trim();
    if (t.depth === 1) {
      if (h1)
        throw new Error(
          `${pageId}: só um "# título" por página (use ## para seções)`,
        );
      h1 = true;
      ids.set(t, { drop: true });
      continue;
    }
    let id = explicit?.[1];
    if (!id && t.depth <= 3) {
      id = slug(text);
      if (!id)
        throw new Error(
          `página ${pageId}: o título "${text}" não gera âncora (sem letras ou números)`,
        );
    }
    if (id) {
      if (RESERVED_IDS.test(id))
        throw new Error(
          `página ${pageId}: o id "${id}" (título "${text}") é reservado pelo layout do site; use {#outro-id}`,
        );
      if (taken.has(id))
        throw new Error(
          `página ${pageId}: âncora duplicada "${id}" pelos títulos "${taken.get(id)}" e "${text}"; renomeie um deles`,
        );
      taken.set(id, text);
    }
    ids.set(t, { id, text });
    if (t.depth <= 3) headings.push({ depth: t.depth, id, text });
  }

  const links = [];
  marked.use({
    renderer: {
      heading(t) {
        const info = ids.get(t);
        if (info?.drop) return '';
        const inner = this.parser
          .parseInline(t.tokens)
          .replace(/\s*\{#[A-Za-z][\w.:-]*\}\s*$/, '');
        return `<h${t.depth}${info?.id ? ` id="${escapeHtml(info.id)}"` : ''}>${inner}</h${t.depth}>\n`;
      },
      code(t) {
        if (t.codeBlockStyle === 'indented')
          throw new Error(
            `${pageId}: bloco de código indentado; use um bloco cercado com diretiva`,
          );
        const words = (t.lang ?? '').split(/\s+/).filter(Boolean);
        if (!api && !words.includes(OK_MARK))
          throw new Error(
            `${pageId}: bloco de código sem diretiva (em lista ou citação também): use <!-- example: ... -->, <!-- generated: ... --> ou <!-- no-compile: motivo --> antes dele, no nível raiz da página`,
          );
        const lang = words[0] === OK_MARK ? '' : (words[0] ?? '');
        return `${highlight(t.text, lang)}\n`;
      },
      html(t) {
        const text = stripComments(t.text);
        assertSafeHtml(text, pageId, { external: false });
        return escapeRawHtml(text, allowed);
      },
      link(t) {
        const href = rewriteHref(t.href, pageId);
        links.push(href);
        const external = /^(https?:)?\/\//i.test(href);
        const title = t.title ? ` title="${escapeHtml(t.title)}"` : '';
        return `<a href="${escapeHtml(href)}"${title}${external ? ' rel="noopener noreferrer"' : ''}>${this.parser.parseInline(t.tokens)}</a>`;
      },
    },
  });
  const html = marked.parser(tokens);
  return { html, headings, links };
}

/** Separa o HTML nos marcadores de exemplo vivo: [{ html } | { live }]. */
export function splitSegments(html) {
  const segments = [];
  let rest = html;
  for (;;) {
    const i = rest.indexOf(LIVE_OPEN);
    if (i < 0) break;
    const j = rest.indexOf(LIVE_CLOSE, i);
    const before = rest.slice(0, i).trim();
    if (before) segments.push({ html: before });
    segments.push({ live: rest.slice(i + LIVE_OPEN.length, j) });
    rest = rest.slice(j + LIVE_CLOSE.length);
  }
  if (rest.trim()) segments.push({ html: rest.trim() });
  return segments;
}

/**
 * Página do guia: diretivas -> Markdown -> HTML checado (X4) -> segmentos.
 * ctx: { pageId, appRoot, packages, liveIds }
 */
export function renderGuidePage(body, ctx) {
  const expanded = expandDirectives(body, { ...ctx, page: ctx.pageId });
  const { html, headings, links } = convertMarkdown(expanded, {
    pageId: ctx.pageId,
  });
  assertSafeHtml(html, ctx.pageId);
  return { segments: splitSegments(html), headings, links };
}

/** Página de API: Markdown do api-documenter já agrupado (sem diretivas; tabelas HTML aceitas). */
export function renderApiPage(markdown, { pageId }) {
  const { html, headings, links } = convertMarkdown(markdown, {
    pageId,
    api: true,
  });
  assertSafeHtml(html, pageId);
  return { segments: [{ html: html.trim() }], headings, links };
}
