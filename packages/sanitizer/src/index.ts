export const SANITIZER_VERSION = '0.0.0';

export {
  createSanitizer,
  sanitizeRichText,
  type RteSanitizeOptions,
} from './create-sanitizer';
export { RteSanitizeError, type RteSanitizeErrorCode } from './errors';
