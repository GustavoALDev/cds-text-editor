# Política de segurança

## Como reportar uma vulnerabilidade

**Não abra issue pública** para vulnerabilidades.

Use o canal privado do GitHub: na aba **Security** do repositório, clique em **Report a vulnerability** (private advisories). Não há canal por e-mail.

Inclua a versão do pacote, o passo a passo para reproduzir e o impacto estimado.

## Prazos

- Confirmação de recebimento: em até **5 dias úteis**.
- Plano de correção: em até **30 dias**.
- A divulgação é coordenada: o advisory é publicado junto com a versão corrigida.

## Versões suportadas

| Versão                         | Correções de segurança |
| ------------------------------ | ---------------------- |
| `main` (pré-1.0)               | Sim                    |
| Última `1.x` (a partir da 1.0) | Sim                    |
| `1.x` anterior à última        | Não                    |

`TODO-AUTOR`: canal e _dist-tag_ de distribuição (09b); a tabela acima não cita canal até o dono decidir.

Detalhes da política em [docs/support.md](docs/support.md); modelo de ameaças em [docs/security.md](docs/security.md).
