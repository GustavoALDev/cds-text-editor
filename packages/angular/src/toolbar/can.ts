import type { Editor } from '@tiptap/core';

type CanCommands = Record<
  string,
  ((...args: unknown[]) => boolean) | undefined
>;

/** `editor.can().<command>(...args)`; comando ausente (recurso desligado) = `false`. */
export function can(
  editor: Editor,
  command: string,
  ...args: unknown[]
): boolean {
  const fn = (editor.can() as unknown as CanCommands)[command];
  return typeof fn === 'function' && fn(...args);
}
