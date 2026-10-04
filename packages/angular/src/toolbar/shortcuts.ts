import type { RteToolbarItemId } from './items';

export type RteShortcutTarget =
  | RteToolbarItemId
  | 'paragraph'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignJustify';

/**
 * Atalhos registrados pelas extensões do core/Tiptap, na notação do Tiptap
 * (`Mod` = Ctrl, ou Cmd no Mac). Conferidos contra o keymap em
 * `shortcuts.spec.ts` (U11). Ficam de fora `taskList` (`Mod-Shift-9`: o
 * `rtTaskList` do core não registra atalho) e `blockquote` (`Mod-Shift-b`: o
 * `Mod-B` do negrito, do Tiptap, vence a tecla); ver o ADR 0008.
 */
export const RTE_TOOLBAR_SHORTCUTS: Readonly<
  Partial<Record<RteShortcutTarget, string>>
> = Object.freeze({
  undo: 'Mod-z',
  redo: 'Mod-Shift-z',
  bold: 'Mod-b',
  italic: 'Mod-i',
  underline: 'Mod-u',
  strike: 'Mod-Shift-s',
  code: 'Mod-e',
  superscript: 'Mod-.',
  subscript: 'Mod-,',
  bulletList: 'Mod-Shift-8',
  orderedList: 'Mod-Shift-7',
  codeBlock: 'Mod-Alt-c',
  paragraph: 'Mod-Alt-0',
  heading2: 'Mod-Alt-2',
  heading3: 'Mod-Alt-3',
  heading4: 'Mod-Alt-4',
  alignLeft: 'Mod-Shift-l',
  alignCenter: 'Mod-Shift-e',
  alignRight: 'Mod-Shift-r',
  alignJustify: 'Mod-Shift-j',
});

export type RtePlatform = 'mac' | 'other';

interface Parsed {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

function parse(shortcut: string, platform: RtePlatform): Parsed {
  const dashed = shortcut.endsWith('-');
  const parts = (dashed ? shortcut.slice(0, -1) : shortcut).split('-');
  const key = dashed ? '-' : (parts.pop() as string);
  const out: Parsed = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: key.length === 1 ? key.toUpperCase() : key,
  };
  for (const mod of parts) {
    if (mod === 'Mod') {
      if (platform === 'mac') out.meta = true;
      else out.ctrl = true;
    } else if (mod === 'Ctrl') out.ctrl = true;
    else if (mod === 'Alt') out.alt = true;
    else if (mod === 'Shift') out.shift = true;
    else if (mod === 'Meta') out.meta = true;
  }
  return out;
}

/** Texto visível: `Ctrl+Shift+Z` fora do Mac, `⇧⌘Z` no Mac. */
export function formatShortcut(
  shortcut: string,
  platform: RtePlatform,
): string {
  const p = parse(shortcut, platform);
  if (platform === 'mac')
    return `${p.ctrl ? '⌃' : ''}${p.alt ? '⌥' : ''}${
      p.shift ? '⇧' : ''
    }${p.meta ? '⌘' : ''}${p.key}`;
  return [
    p.ctrl && 'Ctrl',
    p.alt && 'Alt',
    p.shift && 'Shift',
    p.meta && 'Meta',
    p.key,
  ]
    .filter(Boolean)
    .join('+');
}

/** Valor de `aria-keyshortcuts`: `Control+Shift+Z` ou `Meta+Shift+Z`. */
export function ariaKeyShortcuts(
  shortcut: string,
  platform: RtePlatform,
): string {
  const p = parse(shortcut, platform);
  return [
    p.ctrl && 'Control',
    p.meta && 'Meta',
    p.alt && 'Alt',
    p.shift && 'Shift',
    p.key,
  ]
    .filter(Boolean)
    .join('+');
}

/** Plataforma pelo `Navigator` (`userAgentData.platform` ou `platform`). */
export function detectPlatform(nav: Navigator | undefined): RtePlatform {
  if (!nav) return 'other';
  const data = (nav as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  const platform = data?.platform || nav.platform || '';
  return /mac|iphone|ipad/i.test(platform) ? 'mac' : 'other';
}
