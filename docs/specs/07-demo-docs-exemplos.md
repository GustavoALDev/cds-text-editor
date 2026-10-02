# Spec 07 — Demo, documentação e servidor de exemplo

> Depende das specs 05 e 06. Referência: plano seções 3.5, 5.4, 7.11 e 8 (Fase 5). Modelo (MyPresentation): `apps/back-end/src/media/*` (upload, magic bytes, limpeza de órfãs, migration) e `apps/back-end/src/common/sanitize/`.

## 1. Objetivo

Um desenvolvedor novo instala e tem **editor + upload + exibição funcionando em ≤ 15 minutos**, seguindo só a documentação. Entregáveis: app `demo`/playground, site de documentação e `examples/server-node`.

## 2. Fora de escopo

Governança e publicação (spec 09); testes de qualidade automatizados em 3 engines (spec 08, embora o demo seja usado por eles).

## 3. Entregáveis

### 3.1 `apps/demo` (Angular 22)
- Páginas: editor completo; toolbar e features configuráveis; formulários (3 modos); i18n (pt-BR/en/es); upload com progresso e cancelamento; renderização do conteúdo (`render`).
- **Playground do tema:** seletores das 3 cores, modo, raio e densidade com **pré-visualização ao vivo**, relatório de contraste (`checkRteTheme`), botões **"copiar CSS"** e **"copiar TypeScript"**, presets (Angular, Oceano, Floresta, Pôr do sol, Monocromático).
- Consome os pacotes **como um consumidor externo** (via tarball/Verdaccio no CI), não por path alias, para provar o empacotamento.

### 3.2 `examples/server-node` (Express, com variante Nest opcional)
- `POST /media/upload`: **magic bytes** (sem confiar no `Content-Type`), limites de tamanho, nome aleatório, resposta no formato esperado por `httpUploadAdapter`.
- Sanitização do HTML com `@cds/rte-sanitizer` antes de gravar.
- **Limpeza de órfãs**, portada do modelo: varredura de todos os textos que referenciam mídia, **carência medida no relógio do armazenamento** (lição 5), `dryRun`, limite por execução, rotas de administração.
- Banco simples (SQLite) para o exemplo; a lib em si **não fala com banco**.

### 3.3 Site de documentação
Guia: início rápido (5 min), instalação, configuração, **tema (escada 0 a 4 e a regra do `inherit`)**, formulários (Signal Forms, Reactive, `[(value)]`, e o NG8022), toolbar e features, i18n, upload e ciclo de vida da mídia, embeds, **segurança** (sanitizar no servidor; modelo de ameaças), SSR, matriz de navegadores, migração, FAQ. **Referência de API** gerada dos tipos (TypeDoc ou Compodoc).

## 4. Requisitos

- **R1.** Todo exemplo de código da documentação é **compilado e testado no CI** (extraído e rodado ou importado do `demo`), para não apodrecer.
- **R2.** O playground não envia dados a terceiros; funciona offline.
- **R3.** O servidor de exemplo tem testes de API: upload válido, rejeição por magic bytes, sanitização, limpeza de órfãs (idade, `dryRun`, limite).
- **R4.** A documentação diz claramente que o **servidor de exemplo é referência**, não produto.
- **R5.** O README da raiz contém o início rápido, o aviso "não afiliado à Tiptap/ProseMirror" e links.

## 5. Critérios de aceite

- [ ] **Teste de 15 minutos:** alguém que não participou do projeto, só com a documentação, instala os pacotes num app Angular 22 limpo e obtém editor + upload + exibição. Tempo e tropeços registrados; docs corrigidas.
- [ ] Playground gera CSS/TS que, colados num app limpo, reproduzem o tema mostrado.
- [ ] Testes de API do `server-node` verdes contra o upload e a limpeza de órfãs.
- [ ] Exemplos da documentação compilam no CI; links verificados.
- [ ] Demo consumindo os tarballs (não path alias) funciona.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Documentação desatualizada em relação à API | Exemplos compilados no CI; referência gerada dos tipos |
| Exemplo de servidor visto como produto | Aviso explícito; escopo mínimo |
