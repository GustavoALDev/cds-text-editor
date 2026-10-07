// Cenário `page` do `size-budget.json`: o custo real de uma página publicada
// (diretiva + sumário + sanitizador), com `@cds/*` embutidos (spec 06, H21).
export {
  RteContent,
  provideRteRender,
} from '../../dist/packages/render/fesm2022/cds-rte-render.mjs';
export { RteToc } from '../../dist/packages/render/fesm2022/cds-rte-render-toc.mjs';
export { createSanitizer } from '@cds/rte-sanitizer';
