# Modelo de ameaças do sanitizador

Este documento descreve o que o `@cds/rte-sanitizer` protege, o que ele não protege, as hipóteses em que a garantia vale, a CSP recomendada e como reportar vulnerabilidades. A decisão e as evidências estão no [ADR 0006](decisions/0006-sanitizador.md); o contrato, na [spec 04](specs/04-sanitizador.md).

## O que o sanitizador protege

- **Execução de script:** nenhum `script`, atributo `on*`, `svg`/`math`, `object`/`embed` nem conteúdo de texto cru na saída.
- **`javascript:`, `data:` e similares:** só `https`, `http`, `mailto` e `tel` (e relativos e fragmentos) passam em `href`, `src`, `poster` e candidatos de `srcset`, inclusive ofuscados por entidades, TAB/LF, maiúsculas, caracteres de controle e `\`.
- **CSS perigoso:** `style` só com as propriedades e valores do esquema; `url(`, `expression`, `\`, comentários, `!important`, `image-set(`, `src(` e `@import` são descartados.
- **`iframe` fora dos provedores:** só os provedores ativos (`src` canônico), sempre vazio e com `sandbox`, `allow` e `referrerpolicy` fixos.
- **_DOM clobbering_:** `id` repetido perde o `id`, e `name`/`id` só aceitam a forma do esquema.
- **_Tabnabbing_:** `target="_blank"` recebe `rel` com `noopener noreferrer` (mais o que a política de links exigir).
- **mXSS:** a saída é serializada da árvore do sanitizador, tudo escapado, num subconjunto estável sob o parser do navegador (invariante I1, testado em Chromium, Firefox e WebKit).

## O que o sanitizador não protege

- **_Phishing_ por link `https`/`http` válido:** um link bem formado para um site malicioso continua válido (a política `blockedDomains` ajuda, mas não substitui moderação).
- **Rastreamento por imagem de qualquer host** quando `mediaHosts` não está configurado: carregar a imagem revela o leitor ao host.
- **Conteúdo dos provedores de embed:** o que o YouTube, o Vimeo ou o Spotify servem dentro do `iframe` não é controlado por nós (o `sandbox` limita, não elimina).
- **Links relativos fora do site:** um `href` relativo vale no domínio onde o HTML for exibido.
- **`mailto:` vindo direto ao servidor:** só `blockedDomains` e `forceRel` da política de links chegam ao esquema; `protocols` e `allowRelative` valem só no editor (ADR 0003, decisão 17).

## Hipóteses

A garantia vale se, e somente se:

1. **A sanitização que conta é a do servidor, na gravação**, com as **mesmas opções do editor** (`createSanitizer(opçõesDoEditor)`). O sanitizador no navegador (spec 06) é uma segunda barreira, nunca a única. Sanitizar só no cliente dá falsa sensação de segurança.
2. **A saída é inserida como filhos de um elemento de fluxo** (como `div`) **num documento HTML em modo padrão**, e **nunca** dentro de atributo, `script`, `svg` ou `template`.
3. **`maxDepth` ≤ 512** (valor aceito pela API; acima disso o parser do Chromium quebraria a estabilidade da leitura).

Fora dessas hipóteses o ADR 0006 não oferece garantia.

## CSP recomendada

A sanitização não substitui a CSP; as duas camadas se somam.

- `script-src` sem `unsafe-inline` e sem `unsafe-eval`; nenhum _handler_ inline é necessário para exibir o conteúdo.
- `frame-src` só com os hosts dos provedores de embed ativos (por exemplo `https://www.youtube-nocookie.com`, `https://player.vimeo.com`, `https://open.spotify.com`).
- `img-src` e `media-src` alinhados a `mediaHosts` (as mesmas origens que o esquema aceita), em vez de `*`.
- `object-src 'none'` e `base-uri 'none'`.
- Quem já sanitiza no servidor e quer evitar o custo do pipe no navegador usa o modo `trusted` da spec 06, junto com Trusted Types, com a CSP acima como defesa em profundidade.

## Como reportar

Reporte vulnerabilidades de forma privada, sem abrir _issue_ pública. O canal e os prazos estão no [SECURITY.md](../SECURITY.md) (spec 09). TODO-AUTOR: o e-mail de contato alternativo do `SECURITY.md` ainda é um marcador; vale o _GitHub Private Vulnerability Reporting_ até o autor confirmá-lo.

Mudanças no esquema, em `sanitizeStyle`, `serializeTokens` ou nos interpretadores afetam a segurança e exigem um `changeset` que as descreva.
