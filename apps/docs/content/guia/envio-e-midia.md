---
title: Envio e mídia
description: Enviar imagens e vídeos para o seu servidor, acompanhar o progresso e limpar os arquivos que ninguém usa mais.
---

# Envio e mídia

Sem configuração, o editor não envia arquivo nenhum: os diálogos de imagem e vídeo só aceitam endereço, e soltar um arquivo é ignorado. Com um **adaptador**, o editor ganha envio por diálogo, colar e soltar, marcadores no texto e uma bandeja de envios. Esta página mostra o caminho principal; as tabelas completas de opções estão no [README do `@comodeviaser/rte-angular`](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/packages/angular/README.md) e na página [`api/angular-upload`](api/angular-upload).

> O site não envia nada, nem de mentira: todos os exemplos desta página são só compilados. Para ver o envio funcionando, abra a [demonstração de arquivos](demo/files).

## Servidor de exemplo: referência, não produto

O repositório traz o [`examples/server-node`](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/examples/server-node/README.md), que cumpre o contrato do `httpUploadAdapter`. Ele existe para você ler e adaptar, **não para publicar como está**. As defesas que ele mostra são o mínimo que o seu servidor também precisa ter:

- **Tipo pelo conteúdo (_magic bytes_)**, nunca pelo MIME ou pela extensão que o navegador declara; SVG é recusado.
- **Revalidação no servidor.** A conferência de tipo e de tamanho no editor é conveniência; só a do servidor vale.
- Autenticação (o exemplo exige `Authorization: Bearer` em `/upload`, `/csrf` e `/content`), CSRF ligado à sessão, nome de arquivo gerado por você, limites (tamanho, teto de pixels, envios simultâneos), `Range` e `X-Content-Type-Options: nosniff` ao servir.

A lista completa de deveres do servidor, com o porquê de cada um, está em [`docs/security.md`](https://github.com/GustavoALDev/comodeviaser-editor/blob/main/docs/security.md); esta página não a repete.

O servidor de exemplo não implementa CORS de propósito: o caminho esperado é o app e o servidor na mesma origem, que em desenvolvimento se resolve com um _proxy_ (veja abaixo).

## Envio por HTTP

`httpUploadAdapter` envia um `multipart/form-data` (o arquivo em `file` e o campo `kind`) e espera um JSON com a `url` da mídia:

<!-- example: examples/envio-e-midia/adapter-http.ts#http -->

Duas coisas valem a pena saber:

- Ele usa `XMLHttpRequest` para ter progresso e cancelamento reais; por isso o `HttpClient` e os seus _interceptors_ **não** participam. Cabeçalhos de autenticação vão em `headers` (objeto ou função).
- A resposta é revalidada pelas regras do esquema. Uma `url` fora de `mediaHosts` (ou relativa, com `allowRelativeMedia: false`) é recusada com o motivo `'response'` e nada entra no texto: se o seu CDN fica em outro host, é a primeira falha que você vai ver.

## Proxy do `ng serve`

O servidor de exemplo escuta em `http://localhost:3000` e não responde a CORS. Em desenvolvimento, deixe o `ng serve` encaminhar `/api` para ele, assim o navegador só fala com a origem do app. Crie o `proxy.conf.json` na raiz do projeto (ao lado do `angular.json`):

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

Inicie o servidor com `ADMIN_TOKEN` e `AUTH_TOKEN`, **os dois obrigatórios para subir**: sem `AUTH_TOKEN` o servidor se recusa a iniciar (só em desenvolvimento, `ALLOW_ANON=1` dispensa a autenticação, com aviso no log). Por exemplo, `ADMIN_TOKEN=troque-me AUTH_TOKEN=outro-segredo node examples/server-node/server.mjs`, e o app com `ng serve --proxy-config proxy.conf.json`. Para não repetir a opção, ponha `"proxyConfig": "proxy.conf.json"` em `options` do alvo `serve` no `angular.json`. Rode o servidor de exemplo de uma pasta onde ele possa gravar: os arquivos vão para `MEDIA_DIR`, que por padrão é `./media` no diretório atual. Quem não tem o repositório encontra o servidor em `examples/server-node` do kit de testes. O `getToken` do exemplo deve devolver o mesmo valor do `AUTH_TOKEN` (aqui, `outro-segredo`), enviado como `Authorization: Bearer`. Atrás de https, ligue `COOKIE_SECURE=1` (cookie `__Host-csrf` com `Secure`) e fixe `CSRF_SECRET`; o `ADMIN_TOKEN` só abre as rotas de limpeza.

**CSRF:** o `/csrf` também exige o bearer, emite um cookie `SameSite=Strict` e devolve o token ligado à sessão. Cada chamada ao `/csrf` troca o cookie e o adaptador envia até dois arquivos ao mesmo tempo, então busque o token **uma vez** e reaproveite (o exemplo acima faz isso). Como o `ng serve` fala só com a sua origem, o cookie e o proxy funcionam sem CORS. As URLs devolvidas começam em `/media/`; são relativas, então o texto as aceita enquanto `allowRelativeMedia` for `true` (o padrão), e a entrada `/media` do _proxy_ as leva ao servidor. Em produção, sirva a mídia de um host próprio e liste-o em `mediaHosts`.

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

O editor nunca apaga arquivo: desfazer pode trazer de volta um endereço que já tinha saído, e outro texto pode usar o mesmo arquivo. A limpeza é do **servidor**, **com carência** (o exemplo usa 7 dias, a vida do rascunho no navegador) e olhando **todos** os textos que citam o arquivo. O adaptador pode ajudar com `onMediaRemoved`, chamado depois de `markSaved` e sem envios pendentes:

<!-- example: examples/envio-e-midia/media-change.ts#remocao -->

No servidor, a regra cabe em duas funções puras (com testes no `ng test` do site): o que o HTML cita, e o que está guardado, não é citado e já passou da carência.

<!-- example: examples/envio-e-midia/orfas.example.ts#orfas -->

O servidor de exemplo traz `DELETE /media` (par do `onMediaRemoved`) e `POST /media/cleanup`, ambos de administrador, com `dryRun` e limite por execução. A varredura dos seus textos é sua.

## Próximos passos

- Segurança do HTML salvo: [Segurança](guia/seguranca).
- Vídeos de plataformas externas: [Embeds](guia/embeds).
- Mostrar o texto publicado: [Exibição](guia/exibicao).
