# Modelo de ameaças do sanitizador

Este documento descreve o que o `@cds/rte-sanitizer` protege, o que ele não protege, as hipóteses em que a garantia vale, a CSP recomendada e como reportar vulnerabilidades. A decisão e as evidências estão no [ADR 0006](decisions/0006-sanitizador.md); o contrato, na [spec 04](specs/04-sanitizador.md).

## O que o sanitizador protege

As garantias abaixo valem para o **esquema padrão**. Opções personalizadas (`features`, `linkPolicy`, `mediaHosts`, provedores de embed) mudam o esquema e podem alargar o que passa; quem as muda responde pelo esquema resultante.

- **Execução de script:** nenhum `script`, atributo `on*`, `svg`/`math`, `object`/`embed` nem conteúdo de texto cru na saída.
- **`javascript:`, `data:` e similares:** só `https`, `http`, `mailto` e `tel` (e relativos e fragmentos) passam em `href`, `src`, `poster` e candidatos de `srcset`, inclusive ofuscados por entidades, TAB/LF, maiúsculas, caracteres de controle e `\`.
- **CSS perigoso:** `style` só com as propriedades e valores do esquema; `url(`, `expression`, `\`, comentários, `!important`, `image-set(`, `src(` e `@import` são descartados.
- **`iframe` fora dos provedores:** só os provedores ativos (`src` canônico), sempre vazio e com `sandbox`, `allow` e `referrerpolicy` fixos.
- **_DOM clobbering_:** `name` nunca passa (o esquema não tem esse atributo); `id` só passa com o padrão `rt-…` do esquema (títulos `h2`–`h4`), e um `id` repetido perde o `id`.
- **_Tabnabbing_:** `target="_blank"` recebe `rel` com `noopener noreferrer` (mais o que a política de links exigir).
- **mXSS:** a saída é serializada da árvore do sanitizador, tudo escapado, num subconjunto que se mantém estável sob o parser do navegador (invariante I1). A estabilidade é **verificada por teste** (corpus de XSS, gerador hostil e as regras N1–N7 do ADR 0006, em Chromium, Firefox e WebKit), não provada formalmente. As divergências entre o `htmlparser2` e o navegador na leitura da _entrada_ (por exemplo, a conversão Unicode de maiúsculas em nomes de tag) só fazem o sanitizador descartar ou manter texto; nunca criam marcação na saída.

## O que o sanitizador não protege

- **_Phishing_ por link `https`/`http` válido:** um link bem formado para um site malicioso continua válido (a política `blockedDomains` ajuda, mas não substitui moderação).
- **`http:` sem TLS:** links, imagens e mídia `http:` passam; podem ser alterados no caminho (_man-in-the-middle_) e, numa página `https`, viram conteúdo misto.
- **Rastreamento por imagem de qualquer host** quando `mediaHosts` não está configurado: carregar a imagem revela o leitor ao host. Um `src` relativo como `/\host/x` é lido pelo navegador como `//host/x`, outro host (não é XSS; imagens `https` absolutas já passam).
- **Conteúdo dos provedores de embed:** o que o YouTube, o Vimeo ou o Spotify servem dentro do `iframe` não é controlado por nós. O `sandbox` fixo é `allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox`: o provedor **executa scripts** com a origem dele (não a da página hospedeira, porque o `src` é sempre de outra origem) e **pode abrir janelas sem _sandbox_**. O `sandbox` não isola de um provedor comprometido; quem não confia nos provedores desliga `embeds`.
- **_UI redress_ por CSS e layout:** o conteúdo permitido ainda pode imitar a interface da página (textos, links e imagens dispostos como botões ou avisos), esconder texto com cores próximas do fundo (as cores da paleta) e ocupar espaço demais: `img` e `iframe` aceitam `width`/`height` até 10000. A página hospedeira deve limitar o conteúdo (por exemplo `max-width: 100%` e `overflow` no contêiner).
- **Links relativos fora do site:** um `href` relativo vale no domínio onde o HTML for exibido.
- **`mailto:` vindo direto ao servidor:** só `blockedDomains` e `forceRel` da política de links chegam ao esquema; `protocols` e `allowRelative` valem só no editor (ADR 0003, decisão 17).

## Hipóteses

A garantia vale se, e somente se:

1. **A sanitização que conta é a do servidor, na gravação**, com as **mesmas opções do editor** (`createSanitizer(opçõesDoEditor)`). O sanitizador no navegador (spec 06) é uma segunda barreira, nunca a única. Sanitizar só no cliente dá falsa sensação de segurança.
2. **A saída é inserida como filhos de um elemento de fluxo** (como `div`) **num documento HTML em modo padrão**, e **nunca** dentro de atributo, `script`, `svg` ou `template`.
3. **A profundidade do ponto de inserção mais `maxDepth` fica ≤ 512.** O parser do Chromium achata o DOM acima de 512 elementos abertos e conta todos os ancestrais do ponto de inserção (`html`, `body`, os invólucros da aplicação), também quando a saída é lida como parte do documento inteiro (SSR). Acima disso a invariante I1 quebra: a árvore lida difere da saída (não é XSS, mas a releitura e a hidratação divergem). A API aceita `maxDepth` até 512; o padrão 256 deixa folga.

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
