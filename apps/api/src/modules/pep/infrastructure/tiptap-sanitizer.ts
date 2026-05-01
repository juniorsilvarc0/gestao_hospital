/**
 * Sanitizador do documento TipTap (ProseMirror JSON).
 *
 * O conteúdo de evolução chega como `{type:'doc', content:[...]}`. Em
 * produção (Fase 13) usaríamos `prosemirror-model` + lista branca de
 * marks/nodes; aqui (Fase 6) implementamos a poda manualmente:
 *   - Apenas tipos conhecidos são aceitos: doc, paragraph, heading,
 *     text, bulletList, orderedList, listItem, hardBreak, blockquote.
 *   - Marks aceitos: bold, italic, underline, strike, code, link
 *     (com normalização de href).
 *   - Atributos com chaves válidas (regex) e valores escalares.
 *   - Strings com `<script>`/`javascript:` removidas.
 *   - Profundidade máxima 12.
 *
 * Side-effect: gera também o `htmlCache` server-side (cache simples,
 * sem styles inline) para evitar render no front em listas. O cache é
 * **garantidamente seguro** (escape de tudo que vai ao DOM).
 */

const ALLOWED_NODES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'bulletList',
  'orderedList',
  'listItem',
  'hardBreak',
  'blockquote',
  'horizontalRule',
]);

const ALLOWED_MARKS = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
]);

const ATTR_KEY = /^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/;
const MAX_DEPTH = 12;
const MAX_TEXT = 50_000;

const DANGEROUS = /<script|javascript:|data:text\/html|on[a-z]+\s*=/i;

export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export class TiptapSanitizationError extends Error {
  constructor(reason: string) {
    super('TIPTAP_INVALID: ' + reason);
    this.name = 'TiptapSanitizationError';
  }
}

export interface SanitizeResult {
  doc: TipTapDoc;
  htmlCache: string;
  textoLivre: string;
}

export function sanitizeTiptap(input: unknown): SanitizeResult {
  if (typeof input !== 'object' || input === null) {
    throw new TiptapSanitizationError('conteudo deve ser objeto.');
  }
  const root = input as { type?: unknown; content?: unknown };
  if (root.type !== 'doc') {
    throw new TiptapSanitizationError('root.type deve ser "doc".');
  }
  if (!Array.isArray(root.content)) {
    throw new TiptapSanitizationError('root.content deve ser array.');
  }
  const cleanContent: TipTapNode[] = [];
  for (const child of root.content) {
    const cleaned = sanitizeNode(child, 1);
    if (cleaned !== null) cleanContent.push(cleaned);
  }
  const doc: TipTapDoc = { type: 'doc', content: cleanContent };

  const textoLivre = extractText(doc).slice(0, MAX_TEXT);
  const htmlCache = renderHtml(doc);

  return { doc, htmlCache, textoLivre };
}

function sanitizeNode(input: unknown, depth: number): TipTapNode | null {
  if (depth > MAX_DEPTH) return null;
  if (typeof input !== 'object' || input === null) return null;
  const node = input as TipTapNode;
  if (typeof node.type !== 'string' || !ALLOWED_NODES.has(node.type)) {
    return null;
  }
  const out: TipTapNode = { type: node.type };

  if (node.attrs !== undefined) {
    out.attrs = sanitizeAttrs(node.attrs);
  }

  if (node.type === 'text') {
    if (typeof node.text !== 'string') return null;
    if (DANGEROUS.test(node.text)) return null;
    out.text = node.text.slice(0, MAX_TEXT);
    if (Array.isArray(node.marks)) {
      const marks = sanitizeMarks(node.marks);
      if (marks.length > 0) out.marks = marks;
    }
    return out;
  }

  if (Array.isArray(node.content)) {
    const cleaned: TipTapNode[] = [];
    for (const child of node.content) {
      const cc = sanitizeNode(child, depth + 1);
      if (cc !== null) cleaned.push(cc);
    }
    out.content = cleaned;
  }
  return out;
}

function sanitizeAttrs(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!ATTR_KEY.test(k)) continue;
    if (typeof v === 'string') {
      if (DANGEROUS.test(v)) continue;
      out[k] = v.slice(0, 500);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeMarks(
  input: Array<{ type: string; attrs?: Record<string, unknown> }>,
): Array<{ type: string; attrs?: Record<string, unknown> }> {
  const out: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
  for (const m of input) {
    if (typeof m !== 'object' || m === null) continue;
    if (typeof m.type !== 'string' || !ALLOWED_MARKS.has(m.type)) continue;
    const mark: { type: string; attrs?: Record<string, unknown> } = {
      type: m.type,
    };
    if (m.type === 'link' && m.attrs !== undefined) {
      const href = m.attrs.href;
      if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
        mark.attrs = { href: href.slice(0, 500) };
      } else {
        continue; // mark inválida, descarta
      }
    } else if (m.attrs !== undefined) {
      mark.attrs = sanitizeAttrs(m.attrs);
    }
    out.push(mark);
  }
  return out;
}

export function extractText(doc: TipTapDoc): string {
  const buf: string[] = [];
  walk(doc as unknown as TipTapNode, buf);
  return buf.join(' ').replace(/\s+/g, ' ').trim();
}

function walk(node: TipTapNode, buf: string[]): void {
  if (node.type === 'text' && typeof node.text === 'string') {
    buf.push(node.text);
  }
  if (Array.isArray(node.content)) {
    for (const c of node.content) walk(c, buf);
  }
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

function renderHtml(doc: TipTapDoc): string {
  const buf: string[] = [];
  for (const node of doc.content) renderNode(node, buf);
  return buf.join('');
}

function renderNode(node: TipTapNode, buf: string[]): void {
  switch (node.type) {
    case 'paragraph':
      buf.push('<p>');
      renderChildren(node, buf);
      buf.push('</p>');
      break;
    case 'heading': {
      const level = clampHeading(node.attrs?.level);
      buf.push('<h' + level + '>');
      renderChildren(node, buf);
      buf.push('</h' + level + '>');
      break;
    }
    case 'bulletList':
      buf.push('<ul>');
      renderChildren(node, buf);
      buf.push('</ul>');
      break;
    case 'orderedList':
      buf.push('<ol>');
      renderChildren(node, buf);
      buf.push('</ol>');
      break;
    case 'listItem':
      buf.push('<li>');
      renderChildren(node, buf);
      buf.push('</li>');
      break;
    case 'blockquote':
      buf.push('<blockquote>');
      renderChildren(node, buf);
      buf.push('</blockquote>');
      break;
    case 'hardBreak':
      buf.push('<br/>');
      break;
    case 'horizontalRule':
      buf.push('<hr/>');
      break;
    case 'text': {
      let text = esc(node.text ?? '');
      if (Array.isArray(node.marks)) {
        for (const m of node.marks) {
          text = applyMark(m, text);
        }
      }
      buf.push(text);
      break;
    }
    default:
      // node não permitido — silenciosamente ignora
      break;
  }
}

function renderChildren(node: TipTapNode, buf: string[]): void {
  if (Array.isArray(node.content)) {
    for (const c of node.content) renderNode(c, buf);
  }
}

function applyMark(
  m: { type: string; attrs?: Record<string, unknown> },
  inner: string,
): string {
  switch (m.type) {
    case 'bold':
      return '<strong>' + inner + '</strong>';
    case 'italic':
      return '<em>' + inner + '</em>';
    case 'underline':
      return '<u>' + inner + '</u>';
    case 'strike':
      return '<s>' + inner + '</s>';
    case 'code':
      return '<code>' + inner + '</code>';
    case 'link': {
      const href = m.attrs?.href;
      if (typeof href === 'string') {
        return '<a href="' + esc(href) + '" rel="noopener noreferrer">' + inner + '</a>';
      }
      return inner;
    }
    default:
      return inner;
  }
}

function clampHeading(value: unknown): number {
  if (typeof value === 'number' && value >= 1 && value <= 6) {
    return Math.floor(value);
  }
  return 2;
}
