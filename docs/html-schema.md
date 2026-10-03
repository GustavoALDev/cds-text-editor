# Esquema de HTML aceito

> Arquivo gerado — não edite à mão; regenere com `UPDATE_SCHEMA_DOC=1 npx nx test core --skip-nx-cache`.

Versão do esquema: 1. Prefixo de classes e ids: `rt-`. Recursos: `base`, `links`, `colors`, `code`, `tables`, `tasks`, `media`, `embeds`, `newsBlocks`.

## Base

| Tag            | Atributos                                            | Classes | Estilos                                                |
| -------------- | ---------------------------------------------------- | ------- | ------------------------------------------------------ |
| `<p>`          | —                                                    | —       | `text-align: enum: left \| center \| right \| justify` |
| `<h2>`         | `id: padrão: ^rt-[a-z0-9]+(?:-[a-z0-9]+)*$ (até 80)` | —       | `text-align: enum: left \| center \| right \| justify` |
| `<h3>`         | `id: padrão: ^rt-[a-z0-9]+(?:-[a-z0-9]+)*$ (até 80)` | —       | `text-align: enum: left \| center \| right \| justify` |
| `<h4>`         | `id: padrão: ^rt-[a-z0-9]+(?:-[a-z0-9]+)*$ (até 80)` | —       | `text-align: enum: left \| center \| right \| justify` |
| `<ul>`         | —                                                    | —       | —                                                      |
| `<ol>`         | `start: int 1–100000`                                | —       | —                                                      |
| `<li>`         | —                                                    | —       | —                                                      |
| `<blockquote>` | —                                                    | —       | —                                                      |
| `<hr>`         | —                                                    | —       | —                                                      |
| `<br>`         | —                                                    | —       | —                                                      |
| `<strong>`     | —                                                    | —       | —                                                      |
| `<em>`         | —                                                    | —       | —                                                      |
| `<u>`          | —                                                    | —       | —                                                      |
| `<s>`          | —                                                    | —       | —                                                      |
| `<code>`       | —                                                    | —       | —                                                      |
| `<sup>`        | —                                                    | —       | —                                                      |
| `<sub>`        | —                                                    | —       | —                                                      |

## Links

| Tag   | Atributos                                                                                                                                                                                                                                                                                               | Classes | Estilos |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| `<a>` | `href: url (https, http, mailto, tel; relativo; fragmento; até 2048) [obrigatório]`<br>`target: valor fixo: "_blank"`<br>`rel: tokens (nofollow sponsored ugc noopener noreferrer; separador ` `; até 200)`<br>`se inválido: desembrulha`<br>`garante em rel: noopener noreferrer quando target=_blank` | —       | —       |

## Cores

| Tag      | Atributos                                                                                                                                                                                                                                                   | Classes | Estilos |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| `<span>` | `data-rt-color: enum: gray \| red \| orange \| green \| blue \| purple \| pink \| teal`<br>`estilo derivado de data-rt-color em color (gray=#5f6368, red=#b3261e, orange=#9f4900, green=#197136, blue=#1d4ed8, purple=#6b21a8, pink=#be185d, teal=#0e6e66)` | —       | —       |
| `<mark>` | `data-rt-color: enum: yellow \| green \| blue \| pink \| orange \| purple`<br>`estilo derivado de data-rt-color em background-color (yellow=#fff3a3, green=#ccf2d1, blue=#d3e8ff, pink=#ffd6e8, orange=#ffe1bf, purple=#eadcff)`                            | —       | —       |

## Código

| Tag      | Atributos | Classes                                        | Estilos |
| -------- | --------- | ---------------------------------------------- | ------- |
| `<pre>`  | —         | —                                              | —       |
| `<code>` | —         | `padrão: ^language-[a-z0-9][a-z0-9+#-]{0,29}$` | —       |

## Tabelas

| Tag          | Atributos                                                                 | Classes | Estilos                                       |
| ------------ | ------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| `<table>`    | —                                                                         | —       | —                                             |
| `<caption>`  | —                                                                         | —       | —                                             |
| `<colgroup>` | —                                                                         | —       | —                                             |
| `<col>`      | —                                                                         | —       | `width: padrão: ^(?:[1-9]\d{0,3})px$ (até 6)` |
| `<thead>`    | —                                                                         | —       | —                                             |
| `<tbody>`    | —                                                                         | —       | —                                             |
| `<tr>`       | —                                                                         | —       | —                                             |
| `<th>`       | `colspan: int 1–100`<br>`rowspan: int 1–100`<br>`scope: enum: col \| row` | —       | —                                             |
| `<td>`       | `colspan: int 1–100`<br>`rowspan: int 1–100`                              | —       | —                                             |

## Tarefas

| Tag       | Atributos                                                                                                             | Classes    | Estilos |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| `<ul>`    | —                                                                                                                     | `rt-tasks` | —       |
| `<li>`    | —                                                                                                                     | `rt-task`  | —       |
| `<label>` | —                                                                                                                     | —          | —       |
| `<input>` | `type: valor fixo: "checkbox" [obrigatório] [padrão: checkbox]`<br>`disabled: sempre presente`<br>`checked: booleano` | —          | —       |

## Mídia

| Tag            | Atributos                                                                                                                                                                                                                                                                                                                                                                          | Classes                                                                                                                  | Estilos |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| `<figure>`     | `filho exigido: img, video`                                                                                                                                                                                                                                                                                                                                                        | `rt-figure`<br>`rt-figure--left`<br>`rt-figure--center`<br>`rt-figure--right`<br>`rt-figure--full`<br>`rt-figure--video` | —       |
| `<img>`        | `src: url (https; relativo; até 2048) [obrigatório]`<br>`alt: texto (até 1000) [obrigatório]`<br>`width: int 1–10000`<br>`height: int 1–10000`<br>`loading: valor fixo: "lazy"`<br>`decoding: valor fixo: "async"`<br>`srcset: srcset (até 8192; cada URL: url (https; relativo; até 2048))`<br>`sizes: padrão: ^[a-zA-Z0-9 ().,:%+/-]{1,256}$ (até 256)`<br>`se inválido: remove` | —                                                                                                                        | —       |
| `<video>`      | `src: url (https; relativo; até 2048) [obrigatório]`<br>`controls: sempre presente`<br>`preload: enum: metadata \| none`<br>`playsinline: booleano`<br>`width: int 1–10000`<br>`height: int 1–10000`<br>`poster: url (https; relativo; até 2048)`<br>`se inválido: remove`                                                                                                         | —                                                                                                                        | —       |
| `<track>`      | `kind: enum: captions \| subtitles`<br>`src: url (https; relativo; até 2048) [obrigatório]`<br>`srclang: padrão: ^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$ (até 30)`<br>`label: texto (até 100)`<br>`default: booleano`<br>`se inválido: remove`                                                                                                                                     | —                                                                                                                        | —       |
| `<figcaption>` | —                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                                                        | —       |
| `<small>`      | —                                                                                                                                                                                                                                                                                                                                                                                  | `rt-credit`                                                                                                              | —       |

## Embeds

| Tag            | Atributos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Classes                                                                       | Estilos                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `<figure>`     | `data-rt-provider: enum: youtube \| vimeo \| spotify`<br>`filho exigido: iframe`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `rt-embed`<br>`rt-embed--youtube`<br>`rt-embed--vimeo`<br>`rt-embed--spotify` | —                                                              |
| `<iframe>`     | `src: url (https; hosts: www.youtube-nocookie.com, player.vimeo.com, open.spotify.com; padrões: ^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}(\?start=\d{1,6})?$ ^https://player\.vimeo\.com/video/\d{1,12}$ ^https://open\.spotify\.com/embed/(track\|album\|playlist\|episode\|show)/[A-Za-z0-9]{22}$; até 2048) [obrigatório]`<br>`title: texto (até 300) [obrigatório]`<br>`width: int 1–10000`<br>`height: int 1–10000`<br>`loading: valor fixo: "lazy"`<br>`referrerpolicy: valor fixo: "strict-origin-when-cross-origin" [obrigatório] [padrão: strict-origin-when-cross-origin]`<br>`allow: valor fixo: "encrypted-media; fullscreen; picture-in-picture" [obrigatório] [padrão: encrypted-media; fullscreen; picture-in-picture]`<br>`allowfullscreen: booleano`<br>`sandbox: valor fixo: "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" [obrigatório] [padrão: allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox]`<br>`se inválido: remove` | —                                                                             | `aspect-ratio: padrão: ^[1-9]\d{0,3} / [1-9]\d{0,3}$ (até 11)` |
| `<figcaption>` | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                             | —                                                              |

## Blocos de notícia

| Tag            | Atributos                                                                                   | Classes                                                                                                                        | Estilos |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `<figure>`     | `filho exigido: blockquote`                                                                 | `rt-pullquote`                                                                                                                 | —       |
| `<figcaption>` | —                                                                                           | —                                                                                                                              | —       |
| `<cite>`       | —                                                                                           | —                                                                                                                              | —       |
| `<aside>`      | `role: valor fixo: "note"`                                                                  | `rt-callout`<br>`rt-callout--info`<br>`rt-callout--success`<br>`rt-callout--warning`<br>`rt-callout--danger`<br>`rt-read-also` | —       |
| `<p>`          | —                                                                                           | `rt-callout__title`<br>`rt-read-also__title`                                                                                   | —       |
| `<span>`       | `lang: padrão: ^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$ (até 30)`<br>`dir: enum: ltr \| rtl` | —                                                                                                                              | —       |

## Paleta de texto

| Nome   | Claro     | Escuro    |
| ------ | --------- | --------- |
| gray   | `#5f6368` | `#bdc1c6` |
| red    | `#b3261e` | `#ff8f87` |
| orange | `#9f4900` | `#f0b84d` |
| green  | `#197136` | `#5fd08a` |
| blue   | `#1d4ed8` | `#8ab4ff` |
| purple | `#6b21a8` | `#d2a8ff` |
| pink   | `#be185d` | `#ff8cc6` |
| teal   | `#0e6e66` | `#5eead4` |

## Paleta de marca-texto

| Nome   | Claro     | Escuro    |
| ------ | --------- | --------- |
| yellow | `#fff3a3` | `#4d4100` |
| green  | `#ccf2d1` | `#1d4a29` |
| blue   | `#d3e8ff` | `#1c3a5e` |
| pink   | `#ffd6e8` | `#5e1f3d` |
| orange | `#ffe1bf` | `#5c3300` |
| purple | `#eadcff` | `#3f2a63` |
