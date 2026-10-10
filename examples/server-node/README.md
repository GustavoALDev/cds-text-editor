# Servidor de exemplo de upload (`examples/server-node`)

> **Este servidor é uma referência, não um produto.** Ele mostra o contrato esperado por `httpUploadAdapter` e as defesas mínimas de um endpoint de upload. Não o publique como está.

Sem dependências de execução: só Node >= 22 (`node:http`, `fetch`/`FormData` globais, `node:crypto`, `node:fs`). Em vez de Express, o código usa o próprio Node para não adicionar dependências ao repositório; adapte a lógica de `createApp` ao seu framework (Express, Nest, Fastify...).

## Executar

```bash
ADMIN_TOKEN=troque-me AUTH_TOKEN=outro-segredo MEDIA_DIR=./media node examples/server-node/server.mjs
# atrás de https: COOKIE_SECURE=1 (cookie __Host-csrf com Secure) e CSRF_SECRET=<segredo estável entre instâncias>
# só em desenvolvimento, sem autenticação: ALLOW_ANON=1 (aviso no log; o servidor NÃO sobe sem AUTH_TOKEN nem ALLOW_ANON)
npm run test:examples   # testes (node:test, usa pasta temporária)
```

## Endpoints

| Rota                  | O que faz                                                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /csrf`           | Exige o bearer. Emite o cookie `csrf` (`__Host-csrf` com `COOKIE_SECURE=1`; `SameSite=Strict`, `HttpOnly`) e devolve `{ token }` ligado à sessão.                                                                                                                                            |
| `POST /upload`        | Multipart (`file`, `kind`). Exige bearer e CSRF (cabeçalho `X-CSRF-Token` válido para a sessão e igual ao cookie). Recusa imagem acima de 40 Mpx (`413 too_many_pixels`) ou sem dimensões legíveis, e responde `503` acima de 4 envios simultâneos. Responde `201 { url, width?, height? }`. |
| `GET /media/<nome>`   | Serve o arquivo em _stream_, com `Range` (vídeo no Safari) e `Content-Type` detectado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` e `Content-Security-Policy: default-src 'none'; sandbox`.                                                                            |
| `POST /content`       | Exemplo de sanitização do HTML antes de gravar (recebe `{ html }`, usa o sanitizador injetado).                                                                                                                                                                                              |
| `DELETE /media`       | Admin. `{ urls, graceMs?, dryRun?, maxDeletions? }`: par do `onMediaRemoved`; só apaga arquivos mais velhos que a carência (padrão 7 dias).                                                                                                                                                  |
| `POST /media/cleanup` | Admin. `{ referenced: [urls], graceMs?, dryRun?, maxDeletions? }`: apaga arquivos não referenciados, por idade, com `dryRun` e limite por execução.                                                                                                                                          |

Defesas: tipo decidido por **magic bytes** (PNG, JPEG, GIF, WebP, WebM, MP4); o MIME e a extensão declarados são ignorados; SVG é recusado; nome aleatório de 128 bits; limite de tamanho pelo `Content-Length` e durante a leitura; largura/altura lidas do cabeçalho do arquivo. A carência usa o relógio do armazenamento (`mtime`), não o do cliente.

## Usar com `httpUploadAdapter`

O token CSRF é ligado à sessão (`nonce.HMAC(segredo, nonce|sessão)`) e confirmado também contra o cookie. **Cada `GET /csrf` troca o cookie**, e o adaptador faz até 2 envios concorrentes: busque o token **uma vez** e reaproveite-o (buscar a cada envio faz o primeiro falhar com 403).

```ts
let csrf: Promise<string> | undefined;
const csrfToken = () =>
  (csrf ??= fetch('http://localhost:3000/csrf', {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => r.json())
    .then((j: { token: string }) => j.token));

httpUploadAdapter({
  endpoint: 'http://localhost:3000/upload',
  withCredentials: true,
  headers: async () => ({
    Authorization: `Bearer ${await getToken()}`,
    'X-CSRF-Token': await csrfToken(),
  }),
});
```

**CORS:** este servidor não emite cabeçalhos CORS. Se a página e a API ficarem em origens diferentes, use uma **lista de origens permitidas** e nunca reflita o `Origin` da requisição com `Access-Control-Allow-Credentials: true` (isso entrega a sessão a qualquer site). Prefira a mesma origem (proxy). Sessão por cookie: passe `sessionOf(req)` (o id da sessão) para ligar o token a ela em vez do bearer.

## O que o integrador precisa acrescentar

- **Autenticação/autorização reais** (o bearer fixo é um stub; marcado `TODO(integrador)`). O servidor se recusa a subir sem `AUTH_TOKEN`; `ALLOW_ANON=1` é só para desenvolvimento.
- **Carência de órfãs ≥ vida do rascunho:** o rascunho do navegador vive 7 dias (`maxAgeMs` do rascunho, `packages/core/src/draft.ts`), então a carência padrão aqui é de 7 dias; reduzi-la apaga mídia de um rascunho ainda restaurável.
- **Armazenamento** durável (objeto/S3, não disco local) e um registro de qual texto usa qual mídia: `POST /media/cleanup` recebe a lista de referências, mas a varredura dos seus textos é sua.
- **Servir a mídia de outro host/CDN** (origem sem cookies), com `Cache-Control` e CORS próprios.
- **Antivírus/reprocessamento** de imagens (recodificar elimina payloads em metadados) e limites de taxa/cota.
- **Sanitização do HTML no servidor** com `@comodeviaser/rte-sanitizer`. O pacote é TypeScript compilado (`npm run build -w @comodeviaser/rte-sanitizer`), por isso este exemplo recebe o sanitizador por injeção (`createApp({ sanitize })`) em vez de importá-lo; passe a função do pacote ali.
