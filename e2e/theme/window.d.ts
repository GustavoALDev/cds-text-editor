export {};

declare global {
  interface Window {
    RteTheme: typeof import('../../packages/theme/src/index');
  }
}
