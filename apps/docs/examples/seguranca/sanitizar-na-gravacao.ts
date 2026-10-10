// #region servidor
import { createSanitizer, type RteSanitizeOptions } from '@comodeviaser/rte-sanitizer';

// O MESMO objeto que o app Angular passa ao editor (provideRichText({ editor }) e provideRteRender).
// Num projeto real ele mora num pacote compartilhado entre o servidor e o app.
export const editorOptions: RteSanitizeOptions = {
  mediaHosts: ['cdn.exemplo.com'],
  linkPolicy: { blockedDomains: ['malicioso.example'] },
};

// Crie uma vez: o esquema é montado aqui e reaproveitado a cada gravação.
const sanitize = createSanitizer(editorOptions);

/** O que o servidor grava: nunca o corpo recebido, sempre a saída do sanitizador. */
export function prepararParaGravar(corpo: unknown): string {
  if (typeof corpo !== 'string') throw new TypeError('corpo deve ser texto');
  return sanitize(corpo);
}
// #endregion

// #region divergente
// ERRADO: opções diferentes das do editor. O servidor continua seguro, mas passa a aceitar (ou a
// descartar) coisas que o editor trata de outro jeito, e o texto muda entre gravar e reabrir.
export const sanitizeSemAsOpcoes = createSanitizer();
// #endregion
