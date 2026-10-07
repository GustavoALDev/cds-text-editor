# Notas para o ADR 0016 (frente B: desempenho, 05d2)

Números preliminares, Chromium, `--workers=1`, máquina com carga leve (vídeo). Orçamentos não ajustados por eles.

## T3 / N45

| Medida | Mediana (ms) | p95 (ms) | Orçamento |
|---|---|---|---|
| Linha de base N8 (sem `?full`), frio | 10,8 a 13,0 | 15,8 a 25,8 | n/a |
| Completo frio, com render | 15,2 a 16,1 | 20,1 a 25,0 | 50 |
| Completo frio, sem render | 12,2 a 14,1 | 19,5 a 22,1 | n/a |
| Completo quente (teclas 251–300), com render | 45,7 a 49,9 | 61,8 a 65,4 | 50 |
| Completo quente, sem render | 37,4 a 38,2 | 46,3 a 47,0 | n/a |
| Busca capada (1000+) | 14,4 a 16,2 | 20,8 a 22,3 | 50 |
| Criação completa (8 amostras) | 90 a 102 | 100 a 143 | 300 |
| Criação vazia, minimal (20) | 9,3 a 9,5 | 12,6 a 13,6 | 50 |
| INP (teclado real, 50 ms entre teclas) | 56 a 96 | n/a | 200 |
| Gravação do rascunho | 0,9 / 2,5 / 1,6 | n/a | 16 |

## Degrau depois de ~150–200 transações (ADR 0008)

- Por fase, tudo sobe junto (~3,5x): `dispatch` 3,6 -> 12 ms, leitura de `valid` 7,7 -> 27 ms, `tick` 2,8 -> 10 ms. Cenário completo: degrau perto da transação 150; linha de base: perto da 200.
- Não é GC: `HeapProfiler.collectGarbage` a cada 50 teclas não remove o degrau; heap 30–130 MB.
- Experimento do laço de CPU: um laço sem relação com o editor (2 milhões de iterações, intercalado com as teclas) passou de 2,0 para 7,5 ms (~3,7x) no mesmo ponto. Conclusão: degrau do ambiente (CPU/processo do navegador sob carga sustentada), não do pacote.
- Decisão do autor: T3b (`valueEmission: 'idle'`) NÃO acionada; orçamento de 50 ms mantido; re-medir com a máquina ociosa e ler no CI Linux (guarda de 2x).
