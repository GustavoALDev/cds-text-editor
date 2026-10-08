---
'@cds/rte-core': minor
---

Segurança (R9): `linkPolicy.protocols` e `linkPolicy.allowRelative` passam a valer também no esquema (e, por ele, no `createSanitizer(opçõesDoEditor)`), com o mesmo efeito do editor; protocolo fora de `https`/`http`/`mailto`/`tel` lança `TypeError`. `idPrefix` agora precisa terminar em hífen (`^[a-z][a-z0-9-]{0,14}-$`, como o padrão `rt-`), contra _DOM clobbering_; um prefixo sem hífen lança `RangeError`. Documentado: padrão permissivo da mídia (`mediaHosts` e `allowRelativeMedia: false` em sites com vários autores), `caption` descartado ao reeditar e rascunho sem escopo por usuário.
