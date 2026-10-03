export {};

declare global {
  interface Window {
    RteCore: typeof import('../../packages/core/src/index') &
      typeof import('../../packages/core/src/embeds/index');
  }
}
