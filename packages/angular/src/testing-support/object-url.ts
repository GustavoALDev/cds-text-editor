/** Sonda dos *object URLs* da miniatura (E16): o que foi criado e revogado. */
export interface ObjectUrlProbe {
  readonly created: string[];
  readonly revoked: string[];
  restore(): void;
}

/**
 * Troca `createObjectURL`/`revokeObjectURL` do `URL` da janela do editor (o
 * gerenciador usa `defaultView.URL`) por registradores; `restore()` devolve
 * os originais.
 */
export function installObjectUrlProbe(): ObjectUrlProbe {
  const url = (document.defaultView as Window & { URL: unknown }).URL as {
    createObjectURL?: ((b: Blob) => string) | undefined;
    revokeObjectURL?: ((u: string) => void) | undefined;
  };
  const original = {
    create: url.createObjectURL,
    revoke: url.revokeObjectURL,
  };
  const created: string[] = [];
  const revoked: string[] = [];
  url.createObjectURL = () => {
    const u = `blob:test/${created.length}`;
    created.push(u);
    return u;
  };
  url.revokeObjectURL = (u: string) => void revoked.push(u);
  return {
    created,
    revoked,
    restore: () => {
      url.createObjectURL = original.create;
      url.revokeObjectURL = original.revoke;
    },
  };
}
