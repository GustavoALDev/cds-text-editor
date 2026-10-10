---
title: Desempenho
description: Os números medidos, o que eles valem e como rodar os orçamentos localmente.
---

# Desempenho

Os números abaixo são de **2026-10-07**, do [ADR 0016](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/docs/decisions/0016-desempenho-e-api.md), com o adendo de **2026-10-08** sobre o CI Linux. Leia como ordem de grandeza: mudam quando o código ou a máquina mudam.

## Os números

Chromium local, máquina com carga leve, cenário completo (documento de 20 mil palavras com tabela e 20 imagens, barra `full`, menus, mídia, busca aberta, contadores e rascunho):

- **Tecla, a frio:** mediana de 15 a 16 ms, p95 de 20 a 25 ms.
- **Tecla, depois de 150 a 200 transações seguidas:** mediana de 46 a 63 ms. O custo sobe cerca de 3,5 vezes nesse ponto; o ADR atribui o degrau ao ambiente (CPU sob carga sustentada), não ao pacote, e o adendo do CI não o reproduz.
- **Criação do editor completo:** mediana de 81 a 102 ms; vazio e com a barra `minimal`, cerca de 9 ms.
- **INP com teclado real:** 56 a 96 ms.

No CI Linux (PR #18) o regime quente não subiu: p95 por tecla de 37 a 70 ms nos três motores e criação completa de 232 a 300 ms.

## Orçamentos: locais, não do CI

Os orçamentos só **reprovam** quando você roda os testes localmente com `RTE_PERF_ENFORCE=1`; no CI eles apenas informam, e lá vale só a guarda de 2 vezes o orçamento. O mesmo texto está no `CONTRIBUTING.md`:

Os números de desempenho do editor são preliminares e de 2026-10-07 ([ADR 0016](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/docs/decisions/0016-desempenho-e-api.md)): no Chromium local, no cenário completo, a tecla leva 15 a 16 ms de mediana a frio e 46 a 63 ms depois de 150 a 200 transações seguidas, contra um orçamento de 50 ms no p95. Os orçamentos só reprovam localmente, com `RTE_PERF_ENFORCE=1` (`e2e/angular/editor-perf-budget.spec.ts`); no CI eles apenas informam, porque os runners são cerca de 2 vezes mais lentos que a máquina local (adendo de 2026-10-08 do ADR 0016), e lá vale só a guarda de 2 vezes o orçamento. Quem muda algo que afeta o custo por tecla ou de criação roda essa verificação local antes de abrir o PR.

## O que você controla

- **Devolva ao modelo o que recebeu do editor**, ou o valor canônico (`getRteHtml`). Um valor equivalente mas não canônico é tratado como carga externa e recarrega o documento, com perda do cursor e do histórico (veja [Formulários](guia/formularios)).
- Diálogos, menus flutuantes, menu `/` e busca vêm em _chunks_ separados, sob demanda; o tamanho de cada cenário é guardado em orçamento (`npm run check:size`).
- A busca é limitada a 1000 ocorrências ("1000+") em documentos muito grandes.

A tabela completa e os limites conhecidos estão na seção "Desempenho e limites conhecidos" do [README do `rte-angular`](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md).
