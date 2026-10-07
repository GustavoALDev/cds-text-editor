import type { RteDialogRequest } from '../controller';

/** Atributos da marca `name` no intervalo do pedido (modo editar), ou `null`. */
export function markAttrs(
  req: RteDialogRequest,
  name: string,
): Readonly<Record<string, unknown>> | null {
  let attrs: Readonly<Record<string, unknown>> | null = null;
  req.doc.nodesBetween(req.range.from, req.range.to, (node) => {
    attrs ??= node.marks.find((m) => m.type.name === name)?.attrs ?? null;
    return !attrs;
  });
  return attrs;
}
