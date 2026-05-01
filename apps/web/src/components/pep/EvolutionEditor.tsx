/**
 * EvolutionEditor — editor WYSIWYG para evoluções clínicas (PEP, Fase 6).
 *
 * Implementação:
 *  - Idealmente seria `@tiptap/react` + StarterKit + Heading + BulletList +
 *    OrderedList + Placeholder. Quando essas libs entrarem no monorepo
 *    (Fase 1 listou TipTap mas a instalação não foi feita ainda), troca-se
 *    o miolo aqui sem alterar a API exterior.
 *  - Implementação atual: `<div contenteditable>` wrapper com toolbar
 *    `document.execCommand` + sanitização rigorosa de HTML antes de salvar
 *    (whitelist de tags) — mesma garantia anti-XSS que o backend faria com
 *    DOMPurify.
 *  - O conteúdo é exposto em dois formatos:
 *      - `getHTML()` — HTML sanitizado (para `conteudoHtml`).
 *      - `getJSON()` — pseudo-ProseMirror JSON (estrutura `{type:'doc', content:[...]}`)
 *        derivado da árvore HTML; é compatível com TipTap quando lib chegar.
 *
 * Macros: `/sintomas`, `/exame-fisico`, `/cid` expandem para snippet HTML.
 *
 * Sinais vitais inline: o botão "+ Sinais Vitais" insere um bloco
 * estruturado com chips dos valores (renderizado como `<div data-vitals="…">`).
 *
 * Auto-save: chama `onAutoSave` em janelas de `autoSaveDelayMs` (default
 * 10s) quando há mudanças. O parent decide se faz PATCH (rascunho) ou no-op
 * (quando readonly após assinatura).
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Stethoscope,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { SinaisVitais } from '@/types/atendimentos';
import { cn } from '@/lib/utils';

/* --------------------------- Sanitização ----------------------------- */
const ALLOWED_TAGS = new Set([
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'H1',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'DIV',
  'SPAN',
]);

const ALLOWED_ATTRS = new Set(['data-vitals', 'data-macro', 'class']);

/**
 * Sanitiza um nodo recursivamente in-place: remove tags fora da whitelist
 * (preservando texto), atributos não permitidos, e qualquer protocolo
 * `javascript:` em hrefs.
 */
function sanitizeNode(root: Element): void {
  const toRemove: Element[] = [];
  const all = root.querySelectorAll('*');
  all.forEach((el) => {
    if (!ALLOWED_TAGS.has(el.tagName)) {
      toRemove.push(el);
      return;
    }
    // Atributos: remover tudo que não seja whitelisted.
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (!ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(attr.name);
      }
      // Sanitiza valor de classe e data-* (sem chars perigosos).
      if (name === 'class' || name.startsWith('data-')) {
        const value = attr.value.replace(/[<>"'`]/g, '');
        el.setAttribute(attr.name, value);
      }
    });
  });
  toRemove.forEach((el) => {
    // Substitui pelo seu textContent — preserva conteúdo, descarta tag/scripts.
    el.replaceWith(document.createTextNode(el.textContent ?? ''));
  });
}

export function sanitizeHtml(dirty: string): string {
  if (typeof document === 'undefined') {
    // SSR fallback: tira angle brackets agressivamente.
    return dirty.replace(/<\/?[^>]+>/g, '');
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = dirty;
  sanitizeNode(wrapper);
  return wrapper.innerHTML;
}

/* --------------------------- HTML → JSON ----------------------------- */
interface DocNode {
  type: string;
  content?: DocNode[];
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, string>;
}

function elementToNode(el: Node): DocNode | null {
  if (el.nodeType === Node.TEXT_NODE) {
    const text = el.textContent ?? '';
    if (!text) return null;
    return { type: 'text', text };
  }
  if (el.nodeType !== Node.ELEMENT_NODE) return null;
  const element = el as Element;
  const tag = element.tagName.toLowerCase();

  const childNodes = Array.from(element.childNodes)
    .map((c) => {
      const node = elementToNode(c);
      if (!node) return null;
      // Wrap inline marks
      if (node.type === 'text') {
        const marks: { type: string }[] = [];
        if (tag === 'strong' || tag === 'b') marks.push({ type: 'bold' });
        if (tag === 'em' || tag === 'i') marks.push({ type: 'italic' });
        if (tag === 'u') marks.push({ type: 'underline' });
        if (marks.length) node.marks = marks;
      }
      return node;
    })
    .filter((n): n is DocNode => Boolean(n));

  switch (tag) {
    case 'p':
      return { type: 'paragraph', content: childNodes };
    case 'h1':
      return { type: 'heading', attrs: { level: '1' }, content: childNodes };
    case 'h2':
      return { type: 'heading', attrs: { level: '2' }, content: childNodes };
    case 'h3':
      return { type: 'heading', attrs: { level: '3' }, content: childNodes };
    case 'ul':
      return { type: 'bulletList', content: childNodes };
    case 'ol':
      return { type: 'orderedList', content: childNodes };
    case 'li':
      return { type: 'listItem', content: childNodes };
    case 'br':
      return { type: 'hardBreak' };
    case 'div': {
      const dataVitals = element.getAttribute('data-vitals');
      if (dataVitals) {
        return {
          type: 'sinaisVitaisInline',
          attrs: { values: dataVitals },
        };
      }
      return childNodes.length > 0
        ? { type: 'paragraph', content: childNodes }
        : null;
    }
    case 'strong':
    case 'b':
    case 'em':
    case 'i':
    case 'u':
    case 'span':
      // Marks aplicados via parent
      return childNodes.length === 1
        ? childNodes[0]
        : { type: 'paragraph', content: childNodes };
    default:
      return childNodes.length > 0
        ? { type: 'paragraph', content: childNodes }
        : null;
  }
}

export function htmlToProseMirrorJSON(html: string): unknown {
  if (typeof document === 'undefined') {
    return { type: 'doc', content: [] };
  }
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html);
  const content = Array.from(wrapper.childNodes)
    .map((c) => elementToNode(c))
    .filter((n): n is DocNode => Boolean(n));
  return { type: 'doc', content };
}

/* --------------------------- Macros ---------------------------------- */
const MACROS: Record<string, string> = {
  '/sintomas':
    '<h3>Sintomas</h3><p>Paciente refere __ há __ dias, com piora __. Nega __.</p>',
  '/exame-fisico':
    '<h3>Exame físico</h3><ul><li>BEG, AAA, ACO.</li><li>ACV: BNRNF 2T s/ sopros.</li><li>AR: MVF s/ ruídos adventícios.</li><li>ABD: flácido, indolor, RHA presentes.</li></ul>',
  '/cid': '<p><strong>CID-10:</strong> __</p>',
};

/* --------------------------- Imperative API -------------------------- */
export interface EvolutionEditorHandle {
  getHTML: () => string;
  getJSON: () => unknown;
  setContent: (html: string) => void;
  focus: () => void;
  isEmpty: () => boolean;
}

interface EvolutionEditorProps {
  /** HTML inicial (rascunho ou conteúdo assinado). */
  initialHtml?: string;
  placeholder?: string;
  readonly?: boolean;
  /** Callback no auto-save (debounced). */
  onAutoSave?: (payload: { html: string; json: unknown }) => void;
  /** Callback síncrono em todo input. */
  onChange?: (payload: { html: string; json: unknown }) => void;
  autoSaveDelayMs?: number;
  /** Permite ao parent abrir um modal de captura de sinais vitais inline. */
  onRequestSinaisVitais?: () => void;
}

/* --------------------------- Component ------------------------------- */
export const EvolutionEditor = forwardRef<
  EvolutionEditorHandle,
  EvolutionEditorProps
>(function EvolutionEditor(
  {
    initialHtml,
    placeholder = 'Comece a evolução. Use "/" para macros.',
    readonly,
    onAutoSave,
    onChange,
    autoSaveDelayMs = 10_000,
    onRequestSinaisVitais,
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSavedRef = useRef<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const writeContent = useCallback((html: string) => {
    if (!editorRef.current) return;
    const sanitized = sanitizeHtml(html);
    editorRef.current.innerHTML = sanitized;
    setIsEmpty(editorRef.current.textContent?.trim().length === 0);
  }, []);

  // Initial mount.
  useEffect(() => {
    if (initialHtml !== undefined) {
      writeContent(initialHtml);
      lastSavedRef.current = sanitizeHtml(initialHtml);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const exposeHandle = useMemo<EvolutionEditorHandle>(
    () => ({
      getHTML: () => sanitizeHtml(editorRef.current?.innerHTML ?? ''),
      getJSON: () =>
        htmlToProseMirrorJSON(editorRef.current?.innerHTML ?? ''),
      setContent: writeContent,
      focus: () => editorRef.current?.focus(),
      isEmpty: () =>
        (editorRef.current?.textContent?.trim().length ?? 0) === 0,
    }),
    [writeContent],
  );

  useImperativeHandle(ref, () => exposeHandle, [exposeHandle]);

  const triggerAutoSave = useCallback(() => {
    if (!onAutoSave) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const html = sanitizeHtml(editorRef.current?.innerHTML ?? '');
      if (html === lastSavedRef.current) return;
      lastSavedRef.current = html;
      onAutoSave({
        html,
        json: htmlToProseMirrorJSON(html),
      });
    }, autoSaveDelayMs);
  }, [autoSaveDelayMs, onAutoSave]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setIsEmpty(editorRef.current.textContent?.trim().length === 0);
    onChange?.({
      html: sanitizeHtml(html),
      json: htmlToProseMirrorJSON(html),
    });
    triggerAutoSave();
  }, [onChange, triggerAutoSave]);

  /**
   * Detecta digitação de macros: o usuário digita "/sintomas" e damos
   * Enter (ou espaço) para expandir. Para simplicidade, reagimos a
   * `keyup` Enter quando o último token começar com `/`.
   */
  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return;
      const text = node.textContent ?? '';
      const match = text.match(/(\/(?:sintomas|exame-fisico|cid))\b/);
      if (!match) return;
      const macro = match[1] as keyof typeof MACROS;
      const replacement = MACROS[macro];
      if (!replacement) return;
      // Substitui o token e injeta HTML.
      node.textContent = text.replace(match[1], '');
      // Insere o snippet
      const tmp = document.createElement('div');
      tmp.innerHTML = sanitizeHtml(replacement);
      const frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      range.collapse(false);
      range.insertNode(frag);
      handleInput();
    },
    [handleInput],
  );

  const exec = useCallback(
    (cmd: string, value?: string) => {
      if (readonly) return;
      editorRef.current?.focus();
      // execCommand é deprecated mas ainda funcional em browsers; quando
      // TipTap entrar isso é substituído por chain().focus().toggleBold()...
      document.execCommand(cmd, false, value);
      handleInput();
    },
    [handleInput, readonly],
  );

  function insertSinaisVitaisBlock(values: SinaisVitais): void {
    if (readonly) return;
    const parts: string[] = [];
    if (values.paSistolica && values.paDiastolica) {
      parts.push(`PA ${values.paSistolica}/${values.paDiastolica} mmHg`);
    }
    if (values.fc) parts.push(`FC ${values.fc} bpm`);
    if (values.fr) parts.push(`FR ${values.fr} irpm`);
    if (values.temp) parts.push(`T ${values.temp}°C`);
    if (values.satO2) parts.push(`SatO2 ${values.satO2}%`);
    if (values.glicemia) parts.push(`Glicemia ${values.glicemia} mg/dL`);
    if (values.evaDor !== null && values.evaDor !== undefined) {
      parts.push(`EVA dor ${values.evaDor}`);
    }
    if (parts.length === 0) return;
    const data = parts.join(' | ');
    const html = `<div data-vitals="${data}" class="hms-vitals-inline">${data}</div>`;
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    handleInput();
  }

  return (
    <div className="rounded-md border bg-background">
      {readonly ? null : (
        <div
          role="toolbar"
          aria-label="Formatação"
          className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Negrito"
            onClick={() => exec('bold')}
          >
            <Bold aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Itálico"
            onClick={() => exec('italic')}
          >
            <Italic aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Sublinhado"
            onClick={() => exec('underline')}
          >
            <UnderlineIcon aria-hidden="true" />
          </Button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Título 1"
            onClick={() => exec('formatBlock', '<h1>')}
          >
            <Heading1 aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Título 2"
            onClick={() => exec('formatBlock', '<h2>')}
          >
            <Heading2 aria-hidden="true" />
          </Button>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Lista com marcadores"
            onClick={() => exec('insertUnorderedList')}
          >
            <List aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Lista numerada"
            onClick={() => exec('insertOrderedList')}
          >
            <ListOrdered aria-hidden="true" />
          </Button>
          {onRequestSinaisVitais ? (
            <>
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRequestSinaisVitais()}
              >
                <Stethoscope aria-hidden="true" />
                Sinais Vitais
              </Button>
            </>
          ) : null}
        </div>
      )}

      <div
        ref={editorRef}
        role="textbox"
        aria-label="Conteúdo da evolução"
        aria-multiline="true"
        aria-readonly={readonly ? true : undefined}
        contentEditable={!readonly}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={handleKeyUp}
        onPaste={(event) => {
          // Cola apenas como texto plano (evita HTML hostil).
          if (readonly) return;
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        data-empty={isEmpty || undefined}
        data-placeholder={placeholder}
        className={cn(
          'min-h-[280px] p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'prose-sm max-w-none [&_h1]:mt-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_div[data-vitals]]:my-2 [&_div[data-vitals]]:rounded-md [&_div[data-vitals]]:border [&_div[data-vitals]]:bg-emerald-50 [&_div[data-vitals]]:px-2 [&_div[data-vitals]]:py-1 [&_div[data-vitals]]:text-xs [&_div[data-vitals]]:text-emerald-900',
          'data-[empty]:before:pointer-events-none data-[empty]:before:text-muted-foreground data-[empty]:before:content-[attr(data-placeholder)]',
          readonly && 'bg-muted/30',
        )}
      />

      {/* Componente exporta também método imperativo para inserir VS via `insertSinaisVitaisBlock` via ref. */}
      {/* Se um dia precisar pelo handle, expõe-se aqui. */}
      <SinaisVitaisInserter
        registerInserter={(fn) => {
          // Anexa no handle imperativo via instância — permite o parent
          // chamar `editorRef.current?.insertVitals(...)` se precisar.
          (exposeHandle as unknown as Record<string, unknown>).insertVitals = fn;
        }}
        insert={insertSinaisVitaisBlock}
      />
    </div>
  );
});

/**
 * Componente "shim" para registrar o inserter de sinais vitais como handle
 * imperativo extra sem expandir a interface principal.
 */
function SinaisVitaisInserter({
  registerInserter,
  insert,
}: {
  registerInserter: (fn: (values: SinaisVitais) => void) => void;
  insert: (values: SinaisVitais) => void;
}): null {
  useEffect(() => {
    registerInserter(insert);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert]);
  return null;
}
