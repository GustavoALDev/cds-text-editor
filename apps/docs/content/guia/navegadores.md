---
title: Navegadores
description: A matriz de verificação (os três motores do CI), não uma promessa de suporte.
---

# Navegadores

Esta página é uma **matriz de verificação**: diz em quais navegadores a suíte roda hoje. Ela **não** é uma promessa de suporte. A matriz de navegadores **suportados**, medida e com versões mínimas, é trabalho da [spec 08](https://github.com/GustavoALDev/cds-text-editor/blob/main/docs/specs/08-qualidade.md) e vai substituir esta página.

## O que roda

Os testes de navegador usam o Playwright, nos três motores, localmente e no CI de cada PR:

| Motor    | Versão verificada (ADR 0002) | Onde roda  |
| -------- | ---------------------------- | ---------- |
| Chromium | 153.0.8010.12                | local e CI |
| Firefox  | 155.0                        | local e CI |
| WebKit   | 26.6                         | local e CI |

As versões vêm do [ADR 0002](https://github.com/GustavoALDev/cds-text-editor/blob/main/docs/decisions/0002-tema-cores-padrao-e-navegadores.md), do momento em que o tema foi medido; o CI instala o que o Playwright do `package-lock.json` traz, então o número exato muda quando o Playwright é atualizado. Os três motores têm cores relativas, `light-dark()` e `@property`; o tema tem um plano B em TypeScript para quem não os tem (veja [Tema](guia/tema)).

## O que isso não diz

- **Versões mais antigas** dos três motores não foram testadas, e navegadores de celular só foram cobertos pelo motor que usam, sem teste em aparelho.
- **Leitor de tela real** (NVDA, JAWS, VoiceOver, TalkBack) e **teclado virtual** ainda não foram testados; a acessibilidade verificada até aqui é a automática (axe) e a de teclado. Isso também é da spec 08.
- Uma parte da suíte é só do Chromium, como a medida de INP (veja [Desempenho](guia/desempenho)).

Se o seu público exige uma lista fechada de navegadores, trate esta matriz como ponto de partida e rode a sua própria verificação.
