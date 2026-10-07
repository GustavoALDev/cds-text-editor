# Servidor de exemplo de upload (`examples/server-node`)

> **Este servidor é uma referência, não um produto.** Ele mostra o contrato esperado por `httpUploadAdapter` e as defesas mínimas de um endpoint de upload. Não o publique como está.

Sem dependências de execução: só Node >= 22 (`node:http`, `fetch`/`FormData` globais, `node:crypto`, `node:fs`). Em vez de Express, o código usa o próprio Node para não adicionar dependências ao repositório; adapte a lógica de `createApp` ao seu framework (Express, Nest, Fastify...).

## Executar

```bash
ADMIN_TOKEN=troque-me AUTH_TOKEN=outro-segredo MEDIA_DIR=./media node examples/server-node/server.mjs
npm run test:examples   # testes (node:test, usa pasta temporária)
```

## Endpoints

| Rota                  | O que faz                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /csrf`           | Emite o cookie `csrf` e devolve `{ token }`.                                                                                                                             |
| `POST /upload`        | Multipart (`file`, `kind`). Exige bearer (se `AUTH_TOKEN`) e CSRF (cabeçalho `X-CSRF-Token` igual ao cookie). Responde `201 { url, width?, height? }`.                   |
| `GET /media/<nome>`   | Serve o arquivo com `Content-Type` detectado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` e `Content-Security-Policy: default-src 'none'; sandbox`. |
| `POST /content`       | Exemplo de sanitização do HTML antes de gravar (recebe `{ html }`, usa o sanitizador injetado).                                                                          |
| `DELETE /media`       | Admin. `{ urls, graceMs?, dryRun?, maxDeletions? }`: par do `onMediaRemoved`; só apaga arquivos mais velhos que a carência.                                              |
| `POST /media/cleanup` | Admin. `{ referenced: [urls], graceMs?, dryRun?, maxDeletions? }`: apaga arquivos não referenciados, por idade, com `dryRun` e limite por execução.                      |

Defesas: tipo decidido por **magic bytes** (PNG, JPEG, GIF, WebP, WebM, MP4); o MIME e a extensão declarados são ignorados; SVG é recusado; nome aleatório de 128 bits; limite de tamanho pelo `Content-Length` e durante a leitura; largura/altura lidas do cabeçalho do arquivo. A carência usa o relógio do armazenamento (`mtime`), não o do cliente.

## Usar com `httpUploadAdapter`

```ts
httpUploadAdapter({
  endpoint: 'http://localhost:3000/upload',
  withCredentials: true,
  headers: async () => ({
    Authorization: `Bearer ${await getToken()}`,
    'X-CSRF-Token': (
      await (
        await fetch('http://localhost:3000/csrf', { credentials: 'include' })
      ).json()
    ).token,
  }),
});
```

## O que o integrador precisa acrescentar

- **Autenticação/autorização reais** (o bearer fixo é um stub; marcado `TODO(integrador)`).
- **Armazenamento** durável (objeto/S3, não disco local) e um registro de qual texto usa qual mídia: `POST /media/cleanup` recebe a lista de referências, mas a varredura dos seus textos é sua.
- **Servir a mídia de outro host/CDN** (origem sem cookies), com `Cache-Control` e CORS próprios.
- **Antivírus/reprocessamento** de imagens (recodificar elimina payloads em metadados) e limites de taxa/cota.
- **Sanitização do HTML no servidor** com `@cds/rte-sanitizer`. O pacote é TypeScript compilado (`npm run build -w @cds/rte-sanitizer`), por isso este exemplo recebe o sanitizador por injeção (`createApp({ sanitize })`) em vez de importá-lo; passe a função do pacote ali.
