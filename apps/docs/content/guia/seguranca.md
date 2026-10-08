---
title: Segurança
description: Onde sanitizar, com quais opções, o que o sanitizador não cobre e a CSP recomendada.
---

# Segurança

O HTML que o editor produz vem de uma pessoa, e o HTML que você exibe pode ter vindo de qualquer lugar. Esta página diz **onde** sanitizar e o que mais você precisa fazer. O modelo de ameaças completo, com as garantias e as hipóteses, está em [`docs/security.md`](https://github.com/GustavoALDev/cds-text-editor/blob/main/docs/security.md); aqui está só o caminho prático.

## A regra que importa

**A sanitização que conta é a do servidor, na gravação, com as mesmas opções do editor.** O sanitizador no navegador (a exibição com `[rteContent]` e o próprio editor) é uma segunda barreira, nunca a única: um cliente adulterado ou outro sistema que grave no mesmo banco não passa por ela. Sanitizar só no navegador dá falsa sensação de segurança.

<!-- example: examples/seguranca/sanitizar-na-gravacao.ts#servidor -->

O objeto `editorOptions` é o mesmo que o app passa ao `provideRichText` e ao `provideRteRender`. Se ele mudar de um lado e não do outro, o servidor continua seguro, mas passa a aceitar ou a descartar coisas que o editor trata de outro jeito:

<!-- example: examples/seguranca/sanitizar-na-gravacao.ts#divergente -->

Entrada acima dos limites lança `RteSanitizeError` (`input-too-long`, `max-depth`); responda com 413 ou 422 em vez de truncar. O padrão de uso está na seção "Uso no servidor" do [README do sanitizador](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/sanitizer/README.md) e a referência em [`api/sanitizer`](api/sanitizer).

## Exibir sem `bypassSecurityTrustHtml`

Para mostrar o HTML publicado, use `[rteContent]` (veja [Exibição](guia/exibicao)). Você **não** precisa de `bypassSecurityTrustHtml` nem de `innerHTML` no seu código: a diretiva tem uma única porta controlada para o DOM, sanitiza por padrão e funciona com Trusted Types. O modo `trusted` só serve a HTML que o seu servidor já sanitizou com `createSanitizer`; com HTML de outra origem ele não protege de nada.

## O que o sanitizador não cobre

Resumo da seção "O que o sanitizador não protege" do modelo de ameaças, que vale ler inteira:

- Link `https` para um site malicioso continua sendo link válido: a política `blockedDomains` ajuda, não substitui moderação.
- Imagem de qualquer host revela o leitor a esse host. Restrinja com `mediaHosts`.
- O conteúdo dos provedores de embed (YouTube, Vimeo, Spotify) não é controlado por nós. Quem não confia neles desliga `embeds` (veja [Embeds](guia/embeds)).
- O conteúdo permitido ainda pode imitar a interface da página. Limite o contêiner (`max-width`, `overflow`).
- A garantia vale só se a saída entra como filhos de um elemento de fluxo, em documento em modo padrão, e se a profundidade do ponto de inserção mais `maxDepth` fica até 512 (o padrão, 256, deixa folga).

## CSP

A sanitização não substitui a CSP; as duas se somam. O resumo do que o modelo de ameaças recomenda: `script-src` sem `unsafe-inline` nem `unsafe-eval`; `frame-src` só com os provedores de embed ativos; `img-src` e `media-src` alinhados a `mediaHosts`; `object-src 'none'` e `base-uri` restrito. Um exemplo completo, com o desvio do Chromium e a hidratação, está em [SSR e CSP](guia/ssr-e-csp).

## Envio de arquivos

O editor não envia nada sem um gesto da pessoa, mas o servidor que recebe o arquivo precisa conferir o tipo real, limitar tamanho e autenticar. A lista está em [Envio e mídia](guia/envio-e-midia).

## Reportar uma vulnerabilidade

Não abra issue pública. O canal e os prazos estão no [SECURITY.md](https://github.com/GustavoALDev/cds-text-editor/blob/main/SECURITY.md).
