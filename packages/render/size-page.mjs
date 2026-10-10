// Cenário `page` do `size-budget.json`: o custo real de uma página publicada
// (diretiva + sumário + sanitizador), com `@comodeviaser/*` embutidos (spec 06, H21).
export {
  RteContent,
  provideRteRender,
} from '../../dist/packages/render/fesm2022/comodeviaser-rte-render.mjs';
export { RteToc } from '../../dist/packages/render/fesm2022/comodeviaser-rte-render-toc.mjs';
export { createSanitizer } from '@comodeviaser/rte-sanitizer';
