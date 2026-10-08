---
title: Envio e mídia
description: Enviar imagens e vídeos para o seu servidor, acompanhar o progresso e limpar os arquivos que ninguém usa mais.
---

# Envio e mídia

Sem configuração, o editor não envia arquivo nenhum: os diálogos de imagem e vídeo só aceitam endereço, e soltar um arquivo é ignorado. Com um **adaptador**, o editor ganha envio por diálogo, colar e soltar, marcadores no texto e uma bandeja de envios. Esta página mostra o caminho principal; as tabelas completas de opções estão no [README do `@cds/rte-angular`](https://github.com/GustavoALDev/cds-text-editor/blob/main/packages/angular/README.md) e na página [`api/angular-upload`](api/angular-upload).

> O site não envia nada, nem de mentira: todos os exemplos desta página são só compilados. Para ver o envio funcionando, abra a [demonstração de arquivos](demo/files).

## Servidor de exemplo: referência, não produto

O repositório traz o [`examples/server-node`](https://github.com/GustavoALDev/cds-text-editor/blob/main/examples/server-node/README.md), que cumpre o contrato do `httpUploadAdapter`. Ele existe para você ler e adaptar, **não para publicar como está**. As defesas que ele mostra são o mínimo que o seu servidor também precisa ter:

- **Tipo pelo conteúdo (_magic bytes_)**, nunca pelo MIME ou pela extensão que o navegador declara; SVG é recusado.
- **Revalidação no servidor.** A conferência de tipo e de tamanho no editor é conveniência; só a do servidor vale.
- Autenticação, proteção contra CSRF, nome de arquivo gerado por você, limite de tamanho e `X-Content-Type-Options: nosniff` ao servir.

O servidor de exemplo não implementa CORS de propósito: o caminho esperado é o app e o servidor na mesma origem, que em desenvolvimento se resolve com um _proxy_ (veja abaixo).

## Envio por HTTP

`httpUploadAdapter` envia um `multipart/form-data` (o arquivo em `file` e o campo `kind`) e espera um JSON com a `url` da mídia:

<!-- example: examples/envio-e-midia/adapter-http.ts#http -->

Duas coisas valem a pena saber:

- Ele usa `XMLHttpRequest` para ter progresso e cancelamento reais; por isso o `HttpClient` e os seus _interceptors_ **não** participam. Cabeçalhos de autenticação vão em `headers` (objeto ou função).
- A resposta é revalidada pelas regras do esquema. Uma `url` fora de `mediaHosts` (ou relativa, com `allowRelativeMedia: false`) é recusada com o motivo `'response'` e nada entra no texto: se o seu CDN fica em outro host, é a primeira falha que você vai ver.

## Proxy do `ng serve`

O servidor de exemplo escuta em `http://localhost:3000` e não responde a CORS. Em desenvolvimento, deixe o `ng serve` encaminhar `/api` para ele, assim o navegador só fala com a origem do app. Crie o `proxy.conf.json` na raiz do projeto:

<!-- no-compile: configuração do ng serve do integrador, conferida na rodada 0 e no teste de 15 minutos -->

```json
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "pathRewrite": { "^/api": "" }
  },
  "/media": {
    "target": "http://localhost:3000",
    "secure": false
  }
}
```

Inicie o servidor com `ADMIN_TOKEN` (obrigatório para subir) e `AUTH_TOKEN` (sem ele o envio fica aberto a qualquer um), por exemplo `ADMIN_TOKEN=troque-me AUTH_TOKEN=outro-segredo node examples/server-node/server.mjs`, e o app com `ng serve --proxy-config proxy.conf.json`. O token do `AUTH_TOKEN` é o que o seu `getToken` devolve. As URLs devolvidas começam em `/media/`; são relativas, então o texto as aceita enquanto `allowRelativeMedia` for `true` (o padrão), e a entrada `/media` do _proxy_ as leva ao servidor. Em produção, sirva a mídia de um host próprio e liste-o em `mediaHosts`.

## Adaptador próprio

Se o seu backend não segue esse contrato, implemente `RteUploadAdapter`. O adaptador recebe o arquivo e um contexto com `signal` (cancelamento) e `onProgress`; devolve a `url` e, se souber, as dimensões:

<!-- example: examples/envio-e-midia/adapter-proprio.ts#adaptador -->

Respeite o `signal`: cancelar chama `abort()` de verdade, e o que chegar depois disso é ignorado. Para dar o motivo da falha, rejeite com `RteUploadError`.

## Progresso e cancelamento

O editor mostra a bandeja de envios sozinho. Para ter a sua interface, leia `pendingUploads()` ou `uploads()` e chame `cancelAllUploads()` ou `cancelUpload(id)`; a saída `uploadError` diz qual arquivo falhou e por quê:

<!-- example: examples/envio-e-midia/progresso.ts#progresso -->

## Saber que mídia entrou e saiu

A saída `mediaChange` avisa a cada mudança no conjunto de endereços. Para salvar, prefira `mediaSession()`: ela dá o **líquido** desde a última carga ou `markSaved`. Chame `markSaved` só depois de gravar com sucesso.

<!-- example: examples/envio-e-midia/media-change.ts#sessao -->

## Limpar arquivos órfãos, no servidor

O editor nunca apaga arquivo: desfazer pode trazer de volta um endereço que já tinha saído, e outro texto pode usar o mesmo arquivo. A limpeza é do **servidor**, **com carência** e olhando **todos** os textos que citam o arquivo. O adaptador pode ajudar com `onMediaRemoved`, chamado depois de `markSaved` e sem envios pendentes:

<!-- example: examples/envio-e-midia/media-change.ts#remocao -->

No servidor, a regra cabe em duas funções puras (com testes no `ng test` do site): o que o HTML cita, e o que está guardado, não é citado e já passou da carência.

<!-- example: examples/envio-e-midia/orfas.example.ts#orfas -->

O servidor de exemplo traz `DELETE /media` (par do `onMediaRemoved`) e `POST /media/cleanup`, ambos de administrador, com `dryRun` e limite por execução. A varredura dos seus textos é sua.

## Próximos passos

- Segurança do HTML salvo: [Segurança](guia/seguranca).
- Vídeos de plataformas externas: [Embeds](guia/embeds).
- Mostrar o texto publicado: [Exibição](guia/exibicao).
