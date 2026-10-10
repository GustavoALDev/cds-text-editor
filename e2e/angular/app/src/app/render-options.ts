import { createSanitizer } from '@comodeviaser/rte-sanitizer';

/**
 * Sanitizador das rotas `render*` (spec 06, pré-voo 12): `createSanitizer()` com as
 * opções padrão, as mesmas do editor da rota `content` (que só muda `codeLanguages`,
 * fora do esquema).
 */
export const RENDER_SANITIZE = createSanitizer();
