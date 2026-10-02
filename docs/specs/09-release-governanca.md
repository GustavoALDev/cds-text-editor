# Spec 09 — Release e governança

> Depende de todas as anteriores. Referência: plano seções 3.1, 3.5, 8 (Fases 7 e 8) e 10.

## 1. Objetivo

Publicar `0.x` com tag `next`, validar num **consumidor real**, e lançar a `1.0.0` no npm com **provenance**, licenças revisadas e política de suporte.

## 2. Fora de escopo

Módulo Pro/monetização (fronteira Core/Pro apenas **definida** em documento antes da 1.0; sem implementação); outros frameworks.

## 3. Requisitos

### 3.1 Publicação
- **R1.** Changesets: versão independente por pacote, changelog gerado, tag `next` para pré-lançamentos, `latest` só na 1.0.
- **R2.** `npm publish --provenance` a partir do GitHub Actions; **2FA obrigatório** na organização; token de automação restrito ao escopo; nenhum token em repositório.
- **R3.** Pré-publicação: `publint`, `attw`, instalação em app Angular 22 limpo, `THIRD-PARTY-NOTICES.md` regenerado e licenças revisadas.
- **R4.** `peerDependencies` `@angular/*` em `>=22.0.0 <23`; política documentada para os *minors* do 22 e para o Angular 23.

### 3.2 Validação em consumidor real (Fase 7)
- **R5.** Publicar `0.x` com `next` (ou Verdaccio local) e consumir em **um projeto real em Angular 22+** (pode ser o MyPresentation **se** ele for atualizado para o 22; senão, o `demo` mais outro app).
- **R6.** Roteiro do plano seção 10 (substituir sanitizador e editor, escrever o adaptador de upload do consumidor com `mapResponse`, trocar a exibição) e o checklist: conteúdo antigo abre/edita/salva sem perda; upload e cancelamento; redimensionar; menu `/`/busca/rascunho; blocos de notícia iguais no editor e no site; tema e sobrescrita de `--rte-*`; pt-BR completo; SSR sem erro e HTML sem script; chunk dentro do orçamento; E2E verdes.
- **R7.** Tudo que o consumidor revelar vira correção **na lib**, com teste.

### 3.3 Governança e segurança
- **R8.** `SECURITY.md` com canal privado e prazos de resposta; política de **suporte e depreciação** (semver; o que é API pública: exports, classes `rte-*`, variáveis `--rte-*` de níveis 1 a 3); `CONTRIBUTING`, `CODE_OF_CONDUCT`, templates.
- **R9.** Revisão de segurança final: modelo de ameaças (`docs/security.md`), dependências (`npm audit`), fuzzing do sanitizador, revisão do `httpUploadAdapter` e do exemplo de servidor.
- **R10.** Marca: nome do pacote sem sugerir que é oficial; aviso "não afiliado à Tiptap/ProseMirror" no README e na documentação.
- **R11.** Documento `docs/open-core.md` com a fronteira Core/Pro (compromisso: o que é MIT hoje continua MIT).

## 4. Critérios de aceite

- [ ] `0.x` publicado com `next`; checklist do R6 100 % verde no consumidor escolhido.
- [ ] `1.0.0` no npm com `--provenance`, verificável na página do pacote.
- [ ] API pública congelada (api-extractor sem diferenças), changelog e anúncio publicados.
- [ ] `THIRD-PARTY-NOTICES.md` e revisão de licenças e de segurança concluídas.
- [ ] Política de suporte/depreciação e `SECURITY.md` publicados.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Consumidor real ainda em Angular < 22 | Usar app Angular 22 limpo; só atualizar o consumidor se for desejado |
| Manutenção a longo prazo (issues, segurança) | Política de suporte explícita; automação de dependências |
| Fronteira Core/Pro mal definida | Documentar antes da 1.0 e não mover recursos já MIT |
