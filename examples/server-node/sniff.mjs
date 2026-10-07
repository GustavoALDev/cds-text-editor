// Detecção por magic bytes e leitura de dimensões. Nunca confia no MIME/extensão declarados.

/** @typedef {{ mime: string, ext: string, kind: 'image' | 'video' }} Sniffed */

const ascii = (
  /** @type {Buffer} */ b,
  /** @type {number} */ s,
  /** @type {number} */ e,
) => b.toString('latin1', s, e);

/** @param {Buffer} b @returns {Sniffed | null} */
export function sniff(b) {
  if (
    b.length >= 8 &&
    b.readUInt32BE(0) === 0x89504e47 &&
    b.readUInt32BE(4) === 0x0d0a1a0a
  )
    return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (b.length >= 6 && /^GIF8[79]a$/.test(ascii(b, 0, 6)))
    return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3)
    return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp')
    return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
  return null; // inclui SVG/HTML/texto: recusados
}

/** @param {Buffer} b @param {Sniffed} t @returns {{ width: number, height: number } | null} */
export function dimensions(b, t) {
  try {
    if (t.mime === 'image/png')
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (t.mime === 'image/gif')
      return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (t.mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return {
            width: b.readUInt16BE(i + 7),
            height: b.readUInt16BE(i + 5),
          };
        i += 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    if (t.mime === 'image/webp') {
      const c = ascii(b, 12, 16);
      if (c === 'VP8X')
        return {
          width: 1 + b.readUIntLE(24, 3),
          height: 1 + b.readUIntLE(27, 3),
        };
      if (c === 'VP8L') {
        const v = b.readUInt32LE(21);
        return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) };
      }
      if (c === 'VP8 ')
        return {
          width: b.readUInt16LE(26) & 0x3fff,
          height: b.readUInt16LE(28) & 0x3fff,
        };
    }
  } catch {
    /* cabeçalho truncado */
  }
  return null;
}
