# Roteiro do teste de 15 minutos

Protocolo da spec 07d (L10). Serve ao facilitador e à pessoa que testa. O texto que a pessoa recebe está na seção "Para a pessoa".

## Para o facilitador

1. **Quem:** pessoa que não participou do projeto, com experiência em Angular (>= 1 ano) e sem contato prévio com o repositório (`TODO-AUTOR`: nome ou perfil e data da rodada externa).
2. **Requisitos:** Node >= 22 e npm >= 11.
3. **Preparação, fora do cronômetro:** a pessoa cria o app limpo com `npx -y @angular/cli@22.2.1 new <nome>` (anote as respostas, inclusive SSR) e o serve uma vez (`ng serve`) para confirmar que o ambiente funciona.
4. **Entregue:** o kit `rte-kit-<sha>.zip` (gerado com `node tools/kit.mjs`) e a URL do site (Pages ou `apps/docs/serve.mjs --base /comodeviaser-editor/`).
5. **Cronômetro:** começa quando a pessoa abre o Início rápido. Marcos: (1) o editor aceita texto; (2) uma imagem PNG enviada pelo `httpUploadAdapter` ao servidor de exemplo aparece no editor; (3) o mesmo conteúdo, com a imagem, aparece em `[rteContent]`. Anote o tempo de cada um.
6. **Regras:** só o site, o kit e a documentação do Angular e do Node; pensar em voz alta; o facilitador não ajuda. Intervenção só depois de 5 minutos parado, e conta como tropeço bloqueante.
7. **Aprovação:** 15:00 ou menos, sem intervenção.
8. **Registro:** `docs/usabilidade/teste-15-minutos.md`, uma tabela por rodada: minuto, página, tropeço, gravidade (bloqueante, atraso, cosmético), commit da correção. Tropeço de ambiente (download do npm, Windows, proxy) é registrado como tal.
9. **Correções:** todo tropeço bloqueante ou de atraso vira mudança no guia (ou defeito de pacote, com teste e changeset) antes da próxima rodada. A próxima rodada exige outra pessoa. No máximo 3 rodadas.

## Para a pessoa

Você vai usar uma biblioteca de editor de texto para Angular, só com o site de documentação e o kit que recebeu. Pense em voz alta. Ninguém vai ajudar. O guia manda instalar pacotes `@comodeviaser/rte-*` do registro: no lugar disso, instale os arquivos `./kit/*.tgz` do kit. O servidor de exemplo está em `kit/examples/server-node`.

Objetivo, a partir do Início rápido, no seu app:

1. o editor aceita texto;
2. uma imagem PNG enviada ao servidor de exemplo pelo editor aparece nele;
3. o conteúdo com a imagem aparece em um `[rteContent]`.

Anote cada tropeço: minuto aproximado, página do guia e o que aconteceu.
