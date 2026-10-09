# Roteiro manual de leitor de tela e aparelho real

Spec 08b (O9), ADR [0021](../decisions/0021-visual-movel-e-leitores-de-tela.md). Os testes automáticos (instantâneos ARIA, axe, emulação móvel) pegam regressão de papel, nome e estado, mas só um leitor de tela real prova **o que é anunciado** e como o foco se comporta num `contenteditable`; só um aparelho real prova o teclado do sistema, a autocorreção e as alças de seleção.

## Finalidade e quem executa

- **Executor e data:** `TODO-AUTOR` (o dono do projeto, ou quem ele indicar). A execução é **pré-condição da 1.0** (spec 09): as combinações obrigatórias abaixo precisam ter registro na seção "Execuções" do ADR 0021 antes do _release_.
- O agente que mantém o repositório escreve e atualiza este roteiro; **não o executa**. "Roteiro executado e registrado" continua desmarcado na spec 08 até existir registro.
- Os anúncios esperados vêm dos rótulos reais do pacote em inglês (`RTE_LABELS_EN`, `packages/angular/src/labels/en.ts`) e das regiões vivas. Rótulos em outro idioma seguem o mesmo padrão; a coluna é "o que deve ser anunciado, no sentido", não uma transcrição palavra por palavra, porque cada leitor formata papel e estado a seu modo.

## Combinações

**Obrigatórias antes da 1.0**

| Sistema | Leitor (última versão estável) | Navegador |
| --- | --- | --- |
| Windows | NVDA | Firefox |
| Windows | NVDA | Chrome |
| macOS | VoiceOver | Safari |
| iOS | VoiceOver | Safari |
| Android | TalkBack | Chrome |

**Opcionais** (licença ou disponibilidade): JAWS + Chrome (Windows) e Narrador + Edge (Windows).

## Preparação

1. Abra o app de teste (`npx nx run angular-e2e-app:serve-static`, porta 4317) ou o demo publicado. Rotas do app de teste: `/toolbar`, `/floating`, `/dialogs`, `/media`, `/upload`, `/draft`, `/productivity`, `/render`, `/labels`. Em aparelho móvel, use o demo publicado ou exponha o app de teste na rede local.
2. Atalhos (no macOS, `Cmd` no lugar de `Ctrl`): `Ctrl+K` abre o diálogo de link, `Alt+F10` leva o foco ao menu flutuante visível, `Ctrl+F` abre a busca, `/` no início de um bloco vazio abre o menu de inserção.
3. Leitor ligado, volume audível, navegador sem extensões que mexam na página. Registre as versões do leitor, do navegador e do sistema, e o _commit_ do repositório (`git rev-parse --short HEAD`).
4. **Modo de navegação (NVDA) e foco:** o NVDA alterna entre modo de navegação e modo de foco. Num `contenteditable` ele deve entrar no modo de foco ao receber o foco do editável (som de "modo de foco") e permitir digitar; confira isso no fluxo F1.

Para cada passo marque **passa** (o esperado aconteceu), **parcial** (funciona, mas com anúncio confuso, duplicado ou tardio) ou **falha** (não anuncia, anuncia errado, perde o foco ou não consegue concluir).

## Fluxos

### F1. Rótulo e descrição do editável

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Navegar até o editável | `Tab` | "Rich text editor", papel de caixa de texto de várias linhas (editável); NVDA entra no modo de foco | | |
| 2 | Digitar uma frase | letras | Eco dos caracteres; sem anúncios extras | | |
| 3 | Ler a linha atual | setas | O texto da linha, com o nível de título quando for título | | |
| 4 | Editável `readonly` (uma rota com o campo somente leitura, p. ex. a de formulários) | `Tab` | O texto é lido; o papel indica somente leitura; a digitação é recusada | | |

### F2. Barra de ferramentas

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Entrar na barra | `Tab` a partir do editável (ou o atalho de foco da barra) | Papel de barra de ferramentas e o primeiro botão com nome | | |
| 2 | Percorrer os botões | `←` `→` (foco itinerante: um único `Tab` na barra) | Nome de cada botão; botões de marca informam "pressionado" / "não pressionado" conforme a seleção | | |
| 3 | Botão de menu (títulos) | `Enter` ou `↓` | "expandido"; ao mover pelas opções, o nome da opção; `Esc` fecha e devolve o foco ao botão ("recolhido") | | |
| 4 | Aplicar negrito com seleção | `Enter` no botão | O estado do botão muda para pressionado; a seleção do editável permanece | | |
| 5 | Sair da barra | `Tab` | O foco segue para fora da barra; `Shift+Tab` volta ao último botão focado | | |

### F3. `Alt+F10` e menus flutuantes

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Selecionar texto; ir ao menu flutuante | `Alt+F10` | Papel de barra de ferramentas do menu de texto e o primeiro botão | | |
| 2 | Percorrer e ativar | setas, `Enter` | Nome de cada botão e estado "pressionado" | | |
| 3 | Fechar | `Esc` | O foco volta ao editável, na mesma seleção | | |
| 4 | Menu de link (cursor em link), de tabela, de imagem, de vídeo e de conteúdo incorporado | `Alt+F10` | Cada menu tem o seu nome ("Image", "Video", "Embedded content" etc.) e ações nomeadas; "Remove image" e semelhantes avisam o que fazem | | |

### F4. Menu `/` (inserção de blocos), critério da K4

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Num parágrafo vazio, abrir o menu | `/` | Região viva: contagem de opções ("N options", "1 option"), depois de cerca de 300 ms | | |
| 2 | Mover a opção ativa | `↓` `↑` | O nome da opção ativa é anunciado (por `aria-activedescendant` ou pela região viva), sem repetir a lista inteira e sem anunciar duas vezes a mesma opção | | |
| 3 | Filtrar digitando | letras após `/` | A contagem é atualizada (a digitação rápida anuncia só o último valor) | | |
| 4 | Sem resultados | letras que não casam | "No options" | | |
| 5 | Confirmar | `Enter` | O bloco é inserido; o menu fecha; o foco permanece no editável | | |
| 6 | Cancelar | `Esc` | O menu fecha; o texto digitado fica; o foco permanece no editável | | |

### F5. Busca (`Ctrl+F`)

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Abrir a busca | `Ctrl+F` | Região "Find and replace"; foco no campo "Find" | | |
| 2 | Digitar um termo com resultados | letras | "1 of N" (posição e total) | | |
| 3 | Próximo e anterior | `Enter` / `Shift+Enter` | A posição muda ("2 of N"); o resultado ativo fica visível | | |
| 4 | Termo inexistente | letras | "No results" | | |
| 5 | Mais de 1000 resultados (rota `/productivity`, documento grande) | letras | "n of 1000+" | | |
| 6 | Substituir (modo editável) | botão "Show replace", "Replace", "Replace all" | "N matches replaced." | | |
| 7 | Editável `readonly` | `Ctrl+F` | A busca abre sem os controles de substituir | | |
| 8 | Fechar | `Esc` | O foco volta ao editável | | |

### F6. Diálogos

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Abrir o diálogo de link (rota `/dialogs`) | `Ctrl+K` | Papel de diálogo com o título; o foco vai ao primeiro campo | | |
| 2 | Confirmar com campo inválido | `Enter` | O erro é anunciado e está ligado ao campo (o leitor lê o erro ao focar o campo); o foco vai ao campo com erro | | |
| 3 | Diálogo de imagem sem texto alternativo (`alt`) | confirmar | O `alt` obrigatório da mídia é exigido e o erro é anunciado | | |
| 4 | Diálogo de vídeo com faixas de legenda | adicionar faixas | Cada faixa é anunciada como "Faixa n" (no idioma configurado) | | |
| 5 | Cancelar | `Esc` | O diálogo fecha e o foco volta ao elemento que o abriu (ou ao editável) | | |

### F7. Contadores e limite

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Ir até o contador (rota `/productivity`) | `Tab` / navegação virtual | "N characters" ou "n/limite"; "N words · M min read" | | |
| 2 | Digitar perto do limite | letras | Aviso de restantes ("N characters left."), sem anunciar a cada tecla | | |
| 3 | Tentar passar do limite | letras | "Character limit of N reached." | | |
| 4 | Colar texto acima do limite (modo que permite) | `Ctrl+V` | "N characters over the limit." | | |

### F8. Envio de arquivos

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Soltar ou colar uma imagem (rota `/upload`) | arrastar, `Ctrl+V` | "Uploading 1 file." | | |
| 2 | Acompanhar a bandeja | navegação virtual | Região "Uploads" com o nome do arquivo; o progresso é uma barra de progresso (o percentual **não** é anunciado, por decisão do ADR 0013) | | |
| 3 | Conclusão | aguardar | "<arquivo> uploaded." | | |
| 4 | Erro (servidor indisponível ou arquivo rejeitado) | aguardar | "Could not upload <arquivo>: <motivo>" | | |
| 5 | Cancelar um envio | botão "Cancel upload of <arquivo>" | "Upload of <arquivo> cancelled." | | |

### F9. Rascunho

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Editar, recarregar a página (rota `/draft`) | digitar, `F5` | Aviso na região "Saved draft": "A draft saved on <data> is available." | | |
| 2 | Restaurar | botão "Restore" | O conteúdo volta; o foco vai ao editável | | |
| 3 | Descartar | botão "Discard" | O aviso some e o foco vai ao editável (nunca ao `body`) | | |
| 4 | Duas abas: apagar o rascunho na outra aba com o foco no botão do aviso | outra aba | O aviso some e o foco volta ao editável | | |

### F10. `rte-render` (conteúdo somente leitura)

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Navegar por títulos (rota `/render`) | tecla de títulos do leitor (`H`) | Os níveis dos títulos | | |
| 2 | Sumário | links do sumário | Cada link anuncia o título de destino; ativar move o foco/leitura para o título | | |
| 3 | Tabela larga | `Tab` | O rolador da tabela é focável, tem nome e rola com as setas | | |
| 4 | Bloco de código | navegação virtual | O código é lido como texto; a linguagem aparece se houver rótulo | | |
| 5 | Imagem e vídeo | navegação virtual | O `alt` da imagem; o vídeo com controles nomeados | | |

### F11. Modo de navegação × foco do NVDA no `contenteditable`

| Passo | Ação | Tecla | Anúncio esperado | Resultado | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Com o foco no editável, alternar o modo | `NVDA+Espaço` | Alternância entre modo de foco e de navegação com o som correspondente | | |
| 2 | No modo de navegação, ler o conteúdo | setas | O texto é lido linha a linha, sem se perder | | |
| 3 | Voltar ao modo de foco e digitar | `Enter` ou `NVDA+Espaço` | A digitação volta a funcionar | | |

## Seção móvel real

Em **iOS (Safari, VoiceOver ligado e desligado)** e **Android (Chrome, TalkBack ligado e desligado)**, com o **teclado do sistema** (o Playwright não o emula).

| Passo | Ação | Resultado esperado | Resultado | Nota |
| --- | --- | --- | --- | --- |
| 1 | Tocar no editável e digitar | O cursor aparece onde se tocou; o teclado abre; o menu de texto e a barra ficam visíveis | | |
| 2 | Autocorreção e sugestões | A palavra corrigida entra sem duplicar nem apagar o texto vizinho | | |
| 3 | Composição (IME: japonês, chinês ou acentuação por tecla morta) | O texto composto aparece; o menu flutuante não atrapalha a composição | | |
| 4 | Selecionar com as alças | O menu de texto aparece perto da seleção e não fica **atrás do teclado**; mover as alças não o esconde | | |
| 5 | Tocar nos botões da barra e do menu | O alvo é fácil de acertar; a seleção permanece depois do toque | | |
| 6 | Menu `/` e busca com o teclado aberto | A lista e a barra de busca ficam dentro da área visível | | |
| 7 | Diálogos com o teclado aberto | O campo focado fica visível e as ações alcançáveis (rolagem interna) | | |
| 8 | Colar e soltar imagem | A imagem entra e o envio começa | | |
| 9 | Sair da página com rascunho pendente (recarregar, trocar de aba, fechar) | O rascunho é gravado (`pagehide`/`beforeunload`) e o aviso aparece ao voltar | | |
| 10 | Zoom por pinça sobre um menu aberto | O menu acompanha a área visível | | |

## Critério da K4

O menu `/` é **aceito** se, em **todas as combinações obrigatórias de _desktop_**, mover a opção com as setas anuncia a opção ativa (por `aria-activedescendant` ou pela região viva) **sem duplicação que atrapalhe**, e `Enter` e `Escape` funcionam. É **reprovado** se falhar em qualquer obrigatória: vira defeito do pacote antes da 1.0, com a **região viva como primeira correção** (anunciar a opção ativa nela). O `role="combobox"` no editável segue **rejeitado** pela K4.

## Severidade

- **Falha que impede concluir um fluxo** (não anuncia o essencial, perde o foco, não dá para operar): **bloqueia a 1.0**.
- **Incômodo** (anúncio verboso, duplicado ou tardio, mas o fluxo se conclui): vira _issue_ com dono e não bloqueia.
- **parcial** em fluxo obrigatório exige nota e decisão do dono (bloqueia ou vira _issue_).

## Modelo de registro

Copie para a seção "Execuções" do ADR 0021, um bloco por combinação.

```text
Data: AAAA-MM-DD
Executor: <nome>
Commit: <hash curto>
Sistema operacional: <nome e versão>
Leitor de tela e versão: <ex.: NVDA 2026.x>
Navegador e versão: <ex.: Firefox 155>
Rota/app: <app de teste local | demo publicado>

F1  passa | parcial | falha  nota:
F2  passa | parcial | falha  nota:
F3  passa | parcial | falha  nota:
F4 (K4)  passa | parcial | falha  nota:
F5  passa | parcial | falha  nota:
F6  passa | parcial | falha  nota:
F7  passa | parcial | falha  nota:
F8  passa | parcial | falha  nota:
F9  passa | parcial | falha  nota:
F10 passa | parcial | falha  nota:
F11 passa | parcial | falha  nota:
Móvel real (se aplicável): passa | parcial | falha  nota:

Resultado da K4: aceita | reprovada
Falhas que bloqueiam a 1.0: <lista ou "nenhuma">
Issues abertas: <links>
```
