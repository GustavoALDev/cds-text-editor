import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chromium,
  firefox,
  webkit,
  type BrowserType,
  type FullConfig,
} from '@playwright/test';
import type { Reporter, Suite } from '@playwright/test/reporter';

// Versões dos motores no resumo de qualidade (spec 08b, R3/R4): o repórter, em `onEnd`, abre cada
// motor dos projetos que rodaram (com os mesmos `launchOptions` do projeto, ex.: `CHROME`),
// lê `browser.version()` e grava `test-results/browsers/<projeto>.json` com
// `{ project, name, version }`. `tools/quality-summary.mjs` lista a seção "Navegadores". O
// repórter vê só a configuração, não o navegador: abrir um contexto vazio é mais robusto que
// `executablePath()` + `--version`. Um arquivo por projeto, só escrito se ainda não existir
// (nada de corrida); falha ao abrir um motor não derruba a execução.

const TYPES: Record<string, BrowserType> = { chromium, firefox, webkit };

export default class VersionsReporter implements Reporter {
  private config!: FullConfig;
  private readonly projects = new Set<string>();

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    for (const child of suite.suites) {
      const name = child.project()?.name;
      if (name) this.projects.add(name);
    }
  }

  async onEnd(): Promise<void> {
    const dir = join(this.config.rootDir, 'test-results', 'browsers');
    mkdirSync(dir, { recursive: true });
    for (const project of this.config.projects) {
      if (!this.projects.has(project.name)) continue;
      const name =
        (project.use as { browserName?: string }).browserName ?? project.name;
      const type = TYPES[name];
      if (!type) continue;
      try {
        const browser = await type.launch(
          (project.use as { launchOptions?: object }).launchOptions,
        );
        const version = browser.version();
        await browser.close();
        writeFileSync(
          join(dir, `${project.name}.json`),
          `${JSON.stringify({ project: project.name, name, version }, null, 2)}\n`,
          { flag: 'wx' },
        );
      } catch {
        // arquivo já existente ou motor indisponível: o resumo mostra o que houver
      }
    }
  }
}
