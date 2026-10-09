/**
 * Sanitizador do HTML gravado, para exibir com segurança conteúdo vindo de fonte não confiável.
 *
 * @packageDocumentation
 */

export {
  createSanitizer,
  sanitizeRichText,
  type RteSanitizeOptions,
} from './create-sanitizer';
export { RteSanitizeError, type RteSanitizeErrorCode } from './errors';
