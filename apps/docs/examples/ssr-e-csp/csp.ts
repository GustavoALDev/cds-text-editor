// #region csp
/** CSP estrita que o editor e a exibição suportam (a mesma do site e do demo). */
export const CSP_RECOMENDADA = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://cdn.exemplo.com",
  "media-src 'self' https://cdn.exemplo.com",
  "connect-src 'self'",
  // Só os provedores de embed que você ativou:
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com',
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** Opcional, para quem usa a exibição com `require-trusted-types-for`. */
export const TRUSTED_TYPES =
  "require-trusted-types-for 'script'; trusted-types angular angular#unsafe-bypass";
// #endregion
