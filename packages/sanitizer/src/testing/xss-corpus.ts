// Corpus de XSS do sanitizador (spec 04, §6.1 e R5). Cada caso tem a saída
// exata, escrita à mão a partir de S1–S13. Só opções serializáveis, para o
// mesmo corpus rodar no navegador (E2E). Fora do build.
import { getHtmlSchema } from '@cds/rte-core';
import type { RteSanitizeOptions } from '../index';

export type XssCategory =
  | 'owasp'
  | 'mxss'
  | 'url'
  | 'srcset'
  | 'style'
  | 'handlers'
  | 'elements'
  | 'iframe'
  | 'clobbering'
  | 'tabnabbing'
  | 'proto';

export interface XssCase {
  name: string;
  category: XssCategory;
  input: string;
  expected: string;
  options?: Pick<
    RteSanitizeOptions,
    'features' | 'linkPolicy' | 'mediaHosts' | 'allowRelativeMedia' | 'idPrefix'
  >;
}

/** Mínimo de casos por categoria; `handlers`, um por tag do esquema padrão. */
export const XSS_MIN_PER_CATEGORY: Readonly<Record<XssCategory, number>> = {
  owasp: 30,
  mxss: 25,
  url: 20,
  srcset: 8,
  style: 12,
  handlers: Object.keys(getHtmlSchema().elements).length,
  elements: 12,
  iframe: 10,
  clobbering: 8,
  tabnabbing: 6,
  proto: 6,
};

/** Caso sem a categoria, que vem do grupo. */
type Draft = Omit<XssCase, 'category'>;

const IMG = 'https://example.com/a.jpg';
const VIDEO = 'https://example.com/v.mp4';
const YOUTUBE = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
/** Atributos fixos que o esquema acrescenta a todo `iframe`, nesta ordem. */
const IFRAME_FIXED =
  ' referrerpolicy="strict-origin-when-cross-origin"' +
  ' allow="encrypted-media; fullscreen; picture-in-picture"' +
  ' sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"';
/** `iframe` do YouTube como o sanitizador o devolve. */
const YOUTUBE_OUT = `<iframe src="${YOUTUBE}" title="v"${IFRAME_FIXED}></iframe>`;
const IMG_OUT = `<img src="${IMG}" alt="">`;
const VIDEO_OUT = `<video src="${VIDEO}" controls=""></video>`;
const TASK_INPUT_OUT = '<input type="checkbox" disabled="">';
const ALERT = 'alert(1)';

const owasp: Draft[] = [
  {
    name: 'script externo em maiúsculas',
    input: '<SCRIPT SRC=https://xss.rocks/xss.js></SCRIPT>',
    expected: '',
  },
  {
    name: 'poliglota de contextos',
    input:
      "javascript:/*--></title></style></textarea></script></xmp><svg/onload='+/\"/+/onmouseover=1/+/[*/[]/+alert(1)//'>",
    expected: 'javascript:/*--&gt;',
  },
  {
    name: 'img com javascript: entre aspas',
    input: `<IMG SRC="javascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'img com javascript: sem aspas',
    input: `<IMG SRC=javascript:alert('XSS')>`,
    expected: '',
  },
  {
    name: 'img com JaVaScRiPt: em caixa mista',
    input: `<IMG SRC=JaVaScRiPt:alert('XSS')>`,
    expected: '',
  },
  {
    name: 'img com crase no valor',
    input: '<IMG SRC=`javascript:alert("RSnake says, \'XSS\'")`>',
    expected: '',
  },
  {
    name: 'a sem href com onmouseover',
    input: '<a onmouseover="alert(document.cookie)">xxs link</a>',
    expected: 'xxs link',
  },
  {
    name: 'img malformada com script depois',
    input: '<IMG """><SCRIPT>alert("XSS")</SCRIPT>"\\>',
    expected: '"\\&gt;',
  },
  {
    name: 'img com String.fromCharCode',
    input: '<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>',
    expected: '',
  },
  {
    name: 'img com src # e onmouseover',
    input: `<IMG SRC=# onmouseover="alert('xxs')">`,
    expected: '',
  },
  {
    name: 'img com src vazio que engole o handler',
    input: `<IMG SRC= onmouseover="alert('xxs')">`,
    expected: '',
  },
  {
    name: 'img sem src com handler',
    input: `<IMG onmouseover="alert('xxs')">`,
    expected: '',
  },
  {
    name: 'onerror com entidades decimais longas',
    input:
      '<img src=x onerror="&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041">',
    expected: '',
  },
  {
    name: 'src com entidades decimais',
    input:
      '<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>',
    expected: '',
  },
  {
    name: 'src com entidades hexadecimais sem ponto e vírgula',
    input:
      '<IMG SRC=&#x6A&#x61&#x76&#x61&#x73&#x63&#x72&#x69&#x70&#x74&#x3A&#x61&#x6C&#x65&#x72&#x74&#x28&#x27&#x58&#x53&#x53&#x27&#x29>',
    expected: '',
  },
  {
    name: 'src com TAB literal',
    input: `<IMG SRC="jav\tascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'src com TAB em entidade',
    input: `<IMG SRC="jav&#x09;ascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'src com LF em entidade',
    input: `<IMG SRC="jav&#x0A;ascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'src com CR em entidade',
    input: `<IMG SRC="jav&#x0D;ascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'src com espaço e C0 antes do esquema',
    input: `<IMG SRC=" &#14;  javascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'script com barra no nome',
    input: '<SCRIPT/XSS SRC="http://xss.rocks/xss.js"></SCRIPT>',
    expected: '',
  },
  {
    name: 'body com caracteres não alfanuméricos antes do =',
    input: '<BODY onload!#$%&()*~+-_.,:;?@[/|\\]^`=alert("XSS")>',
    expected: '',
  },
  {
    name: '< extra antes do script',
    input: '<<SCRIPT>alert("XSS");//\\<</SCRIPT>',
    expected: '&lt;',
  },
  {
    name: 'script sem fechamento',
    input: '<SCRIPT SRC=http://xss.rocks/xss.js?< B >',
    expected: '',
  },
  {
    name: 'script com src relativo ao protocolo',
    input: '<SCRIPT SRC=//xss.rocks/.j>',
    expected: '',
  },
  {
    name: 'img meio aberta no fim da entrada',
    input: '<IMG SRC="`<javascript:alert>`(\'XSS\')"',
    expected: '',
  },
  {
    name: 'iframe com < duplo',
    input: '<iframe src=http://xss.rocks/scriptlet.html <',
    expected: '',
  },
  {
    name: 'fechamento de title antes do script',
    input: '</TITLE><SCRIPT>alert("XSS");</SCRIPT>',
    expected: '',
  },
  {
    name: 'input type=image com javascript:',
    input: `<INPUT TYPE="IMAGE" SRC="javascript:alert('XSS');">`,
    expected: TASK_INPUT_OUT,
  },
  {
    name: 'body background',
    input: `<BODY BACKGROUND="javascript:alert('XSS')">`,
    expected: '',
  },
  {
    name: 'img dynsrc',
    input: `<IMG DYNSRC="javascript:alert('XSS')">`,
    expected: '',
  },
  {
    name: 'img lowsrc',
    input: `<IMG LOWSRC="javascript:alert('XSS')">`,
    expected: '',
  },
  {
    name: 'list-style-image em style',
    input:
      '<STYLE>li {list-style-image: url("javascript:alert(\'XSS\')");}</STYLE><UL><LI>XSS</br>',
    expected: '<ul><li>XSS<br></li></ul>',
  },
  {
    name: 'img com vbscript:',
    input: `<IMG SRC='vbscript:msgbox("XSS")'>`,
    expected: '',
  },
  {
    name: 'svg com onload sem espaço',
    input: "<svg/onload=alert('XSS')>",
    expected: '',
  },
  {
    name: 'bgsound',
    input: `<BGSOUND SRC="javascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'br com entidade JavaScript do Netscape',
    input: `<BR SIZE="&{alert('XSS')}">`,
    expected: '<br>',
  },
  {
    name: 'link stylesheet com javascript:',
    input: `<LINK REL="stylesheet" HREF="javascript:alert('XSS');">`,
    expected: '',
  },
  {
    name: 'meta Link',
    input:
      '<META HTTP-EQUIV="Link" Content="<http://xss.rocks/xss.css>; REL=stylesheet">',
    expected: '',
  },
  {
    name: 'expression quebrada por comentário em style',
    input: `<IMG STYLE="xss:expr/*XSS*/ession(alert('XSS'))">`,
    expected: '',
  },
  {
    name: 'table background',
    input: `<TABLE BACKGROUND="javascript:alert('XSS')"><TR><TD>x</TD></TR></TABLE>`,
    expected: '<table><tbody><tr><td>x</td></tr></tbody></table>',
  },
  {
    name: 'td background',
    input: `<TABLE><TR><TD BACKGROUND="javascript:alert('XSS')">x</TD></TR></TABLE>`,
    expected: '<table><tbody><tr><td>x</td></tr></tbody></table>',
  },
  {
    name: 'div background-image',
    input: `<DIV STYLE="background-image: url(javascript:alert('XSS'))">x</DIV>`,
    expected: 'x',
  },
  {
    name: 'div expression',
    input: `<DIV STYLE="width: expression(alert('XSS'));">x</DIV>`,
    expected: 'x',
  },
  {
    name: 'iframe com javascript:',
    input: `<IFRAME SRC="javascript:alert('XSS');"></IFRAME>`,
    expected: '',
  },
  {
    name: 'frameset com frame',
    input: `<FRAMESET><FRAME SRC="javascript:alert('XSS');"></FRAMESET>`,
    expected: '',
  },
  {
    name: 'behavior com .htc',
    input: '<XSS STYLE="behavior: url(xss.htc);">',
    expected: '',
  },
  {
    name: 'comentário condicional do IE',
    input: "<!--[if gte IE 4]><SCRIPT>alert('XSS');</SCRIPT><![endif]-->",
    expected: '',
  },
  {
    name: 'script com > em atributo entre aspas duplas',
    input: '<SCRIPT a=">" SRC="httx://xss.rocks/xss.js"></SCRIPT>',
    expected: '',
  },
  {
    name: "script com >'> em atributo",
    input: `<SCRIPT a=">'>" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
    expected: '',
  },
  {
    name: 'script com atributo só de aspas',
    input: `<SCRIPT "a='>'" SRC="httx://xss.rocks/xss.js"></SCRIPT>`,
    expected: '',
  },
  {
    name: 'href com IP decimal (seguro)',
    input: '<A HREF="http://66.102.7.147/">XSS</A>',
    expected: '<a href="http://66.102.7.147/">XSS</a>',
  },
  {
    name: 'href com host em percent-encoding',
    input:
      '<A HREF="http://%77%77%77%2E%67%6F%6F%67%6C%65%2E%63%6F%6D">XSS</A>',
    expected: '<a href="http://www.google.com/">XSS</a>',
  },
  {
    name: 'href com IP em hexadecimal',
    input: '<A HREF="http://0x42.0x0000066.0x7.0x93/">XSS</A>',
    expected: '<a href="http://66.102.7.147/">XSS</a>',
  },
  {
    name: 'href relativo ao protocolo',
    input: '<A HREF="//www.google.com/">XSS</A>',
    expected: 'XSS',
  },
  {
    name: 'UTF-7 depois de meta charset',
    input:
      '<HEAD><META HTTP-EQUIV="CONTENT-TYPE" CONTENT="text/html; charset=UTF-7"> </HEAD>+ADw-SCRIPT+AD4-alert(\'XSS\');+ADw-/SCRIPT+AD4-',
    expected: "+ADw-SCRIPT+AD4-alert('XSS');+ADw-/SCRIPT+AD4-",
  },
  {
    name: 'img com http: (mídia só https)',
    input:
      '<IMG SRC="http://www.thesiteyouareon.com/somecommand.php?somevariables=maliciouscode">',
    expected: '',
  },
];

const mxss: Draft[] = [
  {
    name: 'noscript com </noscript> em atributo',
    input: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    expected: '',
  },
  {
    name: 'math, mtext, table, mglyph e style',
    input: '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    expected: '',
  },
  {
    name: 'math com comentário em style e img em atributo',
    input:
      '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">',
    expected: '',
  },
  {
    name: 'math com malignmark',
    input:
      '<math><mtext><table><malignmark><style><img src=x onerror=alert(1)>',
    expected: '',
  },
  {
    name: 'svg com </p> e style',
    input: '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    expected: '',
  },
  {
    name: 'svg com p e style',
    input: '<svg><p><style><a id="</style><img src=1 onerror=alert(1)>">',
    expected: '',
  },
  {
    name: 'svg com foreignObject sai inteiro',
    input: '<svg><foreignObject><p>x</p></foreignObject></svg><p>depois</p>',
    expected: '<p>depois</p>',
  },
  {
    name: 'svg com style e img',
    input: '<svg><style><img src=x onerror=alert(1)></style></svg>',
    expected: '',
  },
  {
    name: 'form, math e mglyph (DOMPurify 2.0.0)',
    input:
      '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
    expected: '',
  },
  {
    name: 'title com </title> em atributo',
    input: '<title><p title="</title><img src=x onerror=alert(1)>">',
    expected: '"&gt;',
  },
  {
    name: 'textarea com </textarea> em atributo',
    input: '<textarea><p title="</textarea><img src=x onerror=alert(1)>">',
    expected: '"&gt;',
  },
  {
    name: 'style com </style> em atributo',
    input: '<style><p title="</style><img src=x onerror=alert(1)>">',
    expected: '"&gt;',
  },
  {
    name: 'xmp com </xmp> em atributo',
    input: '<xmp><p title="</xmp><img src=x onerror=alert(1)>">',
    expected: '"&gt;',
  },
  {
    name: 'noembed com </noembed> em atributo',
    input: '<noembed><p title="</noembed><img src=x onerror=alert(1)>">',
    expected: '"&gt;',
  },
  {
    name: 'noframes com </noframes> em atributo',
    input: '<noframes><p title="</noframes><img src=x onerror=alert(1)>">',
    expected: '"&gt;',
  },
  {
    name: 'noscript dentro de p',
    input:
      '<p><noscript><p title="</noscript><img src=x onerror=alert(1)>"></p>',
    expected: '<p></p>',
  },
  {
    name: 'comentário fechado com --!>',
    input: '<!--x--!><img src=x onerror=alert(1)>-->',
    expected: '--&gt;',
  },
  {
    name: 'comentário vazio <!-->',
    input: '<!--><img src=x onerror=alert(1)>-->',
    expected: '--&gt;',
  },
  {
    name: 'comentário <!--->',
    input: '<!---><img src=x onerror=alert(1)>-->',
    expected: '--&gt;',
  },
  {
    name: 'CDATA em HTML',
    input: '<![CDATA[><img src=x onerror=alert(1)>]]>',
    expected: '',
  },
  {
    name: 'instrução de processamento xml',
    input: '<?xml version="1.0"?><img src=x onerror=alert(1)>',
    expected: '',
  },
  {
    name: 'instrução de processamento fechada cedo',
    input: '<?x ><img src=x onerror=alert(1)>?>',
    expected: '?&gt;',
  },
  {
    name: 'form aninhado',
    input:
      '<form><form action="javascript:alert(1)"><button>x</button></form></form>',
    expected: 'x',
  },
  {
    name: 'foster parenting de img',
    input: '<table><img src=x onerror=alert(1)><tr><td>a</td></tr></table>',
    expected: '<table><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'foster parenting de p e a',
    input:
      '<table><p>fora</p><a href="https://example.com/">x</a><tr><td>a</td></tr></table>',
    expected: '<table><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'template com img',
    input: '<template><img src=x onerror=alert(1)></template>ok',
    expected: 'ok',
  },
  {
    name: 'template com script',
    input: '<template><script>alert(1)</script></template><p>ok</p>',
    expected: '<p>ok</p>',
  },
  {
    name: 'plaintext engole o resto',
    input: '<p>a</p><plaintext></plaintext><img src=x onerror=alert(1)>',
    expected: '<p>a</p>',
  },
  {
    name: 'script quebrado <scr<script>ipt>',
    input: '<scr<script>ipt>alert(1)</scr</script>ipt>',
    expected: 'ipt&gt;alert(1)ipt&gt;',
  },
  {
    name: '</p> e img em atributo de elemento mantido',
    input: '<p title="</p><img src=x onerror=alert(1)>">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: 'marcação em valor de atributo mantido sai escapada',
    input: `<img src="${IMG}" alt="&quot;><img src=x onerror=alert(1)>">`,
    expected: `<img src="${IMG}" alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">`,
  },
  {
    name: 'marcação escapada no texto continua texto',
    input: '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
    expected: '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
  },
  {
    name: 'a dentro de a (adoption agency)',
    input:
      '<a href="https://example.com/"><a href="javascript:alert(1)">x</a></a>',
    expected: '<a href="https://example.com/"></a>x',
  },
  {
    name: 'strong fechado dentro de p',
    input: '<strong><p>x</strong>y</p>',
    expected: '<strong><p>x</p></strong>y<p></p>',
  },
  {
    name: 'K de Kelvin vira mark no htmlparser2 (seguro)',
    input: '<marK>x</marK>',
    expected: '<mark>x</mark>',
  },
  {
    name: 'ſ (s longo) não abre tag',
    input: '<ſcript>alert(1)</ſcript>',
    expected: '&lt;ſcript&gt;alert(1)',
  },
  {
    name: 'NUL no nome da tag',
    input: '<scr\0ipt>alert(1)</scr\0ipt>',
    expected: 'alert(1)',
  },
  {
    name: 'NUL no texto vira U+FFFD',
    input: '<p>a\0b</p>',
    expected: '<p>a�b</p>',
  },
  {
    name: 'iframe com fechamento falso em atributo',
    input: `<iframe src="${YOUTUBE}" title="</iframe><img src=x onerror=alert(1)>"></iframe>`,
    expected: `<iframe src="${YOUTUBE}" title="&lt;/iframe&gt;&lt;img src=x onerror=alert(1)&gt;"${IFRAME_FIXED}></iframe>`,
  },
  {
    name: 'fim de tag </ com espaço vira comentário falso',
    input: 'a</ <img src=x onerror=alert(1)>b',
    expected: 'ab',
  },
  {
    name: 'tag inacabada no fim da entrada',
    input: '<p>x</p><img src=x onerror=alert(1)',
    expected: '<p>x</p>',
  },
  {
    name: 'svg fechado por fechamento implícito',
    input: `<svg><p></svg><img src="${IMG}">`,
    expected: IMG_OUT,
  },
  {
    name: 'style de svg esconde img (descartado)',
    input: '<svg><style></svg><img src=x onerror=alert(1)></style>',
    expected: '',
  },
  {
    name: 'annotation-xml com HTML',
    input:
      '<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>',
    expected: '',
  },
  {
    name: 'iframe aninhado em iframe',
    input: `<iframe src="${YOUTUBE}" title="v"><iframe src="javascript:alert(1)"></iframe></iframe><p>ok</p>`,
    expected: `${YOUTUBE_OUT}<p>ok</p>`,
  },
  {
    name: 'fechamento de a dentro do texto do iframe',
    input: `<a href="https://example.com/">x<iframe src="${YOUTUBE}" title="v"></a><img src=x onerror=alert(1)></iframe>`,
    expected: `<a href="https://example.com/">x${YOUTUBE_OUT}</a>`,
  },
  {
    name: 'iframe autofechado engole o resto',
    input: `<iframe src="${YOUTUBE}" title="v"/><img src=x onerror=alert(1)>`,
    expected: YOUTUBE_OUT,
  },
];

const url: Draft[] = [
  {
    name: 'href com TAB em entidade',
    input: '<a href="jav&#x09;ascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href javascript:',
    input: '<a href="javascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href JAVASCRIPT: em maiúsculas',
    input: '<a href="JAVASCRIPT:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com espaço inicial',
    input: '<a href=" javascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com C0 inicial em entidade',
    input: '<a href="&#1;javascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com LF em entidade decimal',
    input: '<a href="java&#10;script:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com CR em entidade decimal',
    input: '<a href="java&#13;script:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com &colon;',
    input: '<a href="javascript&colon;alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com &#58;',
    input: '<a href="javascript&#58;alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com primeira letra em entidade',
    input: '<a href="&#x6A;avascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com NUL em entidade',
    input: '<a href="jav&#x00;ascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href vbscript:',
    input: '<a href="vbscript:msgbox(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href data: base64',
    input:
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    expected: 'x',
  },
  {
    name: 'href data: com script',
    input: '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    expected: 'x',
  },
  {
    name: 'href com barra invertida no esquema',
    input: '<a href="javascript\\:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com \\\\ inicial',
    input: '<a href="\\\\evil.test/x">x</a>',
    expected: 'x',
  },
  {
    name: 'href //',
    input: '<a href="//evil.test/x">x</a>',
    expected: 'x',
  },
  {
    name: 'href /\\',
    input: '<a href="/\\evil.test">x</a>',
    expected: 'x',
  },
  {
    name: 'href javascript:// com %0A',
    input: '<a href="javascript://example.com/%0Aalert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href com credenciais',
    input: '<a href="https://user:pass@example.com/">x</a>',
    expected: 'x',
  },
  {
    name: 'href https: sem barras é normalizado',
    input: '<a href="https:evil.test">x</a>',
    expected: '<a href="https://evil.test/">x</a>',
  },
  {
    name: 'href com aspas e handler no caminho',
    input:
      '<a href="https://example.com/&quot;onmouseover=&quot;alert(1)">x</a>',
    expected: '<a href="https://example.com/%22onmouseover=%22alert(1)">x</a>',
  },
  {
    name: 'href com <script> no caminho',
    input: '<a href="https://example.com/<script>">x</a>',
    expected: '<a href="https://example.com/%3Cscript%3E">x</a>',
  },
  {
    name: 'mailto com corpo',
    input: '<a href="mailto:a@example.com?body=<script>">x</a>',
    expected: '<a href="mailto:a@example.com?body=%3Cscript%3E">x</a>',
  },
  {
    name: 'mailto com javascript: no caminho',
    input: '<a href="mailto:javascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'tel válido',
    input: '<a href="tel:+5511999999999">x</a>',
    expected: '<a href="tel:+5511999999999">x</a>',
  },
  {
    name: 'fragmento com javascript: é só fragmento',
    input: '<a href="#javascript:alert(1)">x</a>',
    expected: '<a href="#javascript:alert(1)">x</a>',
  },
  {
    name: 'blockquote cite javascript:',
    input: '<blockquote cite="javascript:alert(1)">q</blockquote>',
    expected: '<blockquote>q</blockquote>',
  },
  {
    name: 'img data:image/svg+xml',
    input: '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    expected: '',
  },
  {
    name: 'video com javascript:',
    input: '<video src="javascript:alert(1)"></video>',
    expected: '',
  },
  {
    name: 'video com poster javascript: e onerror',
    input: `<video src="${VIDEO}" poster="javascript:alert(1)" onerror="alert(1)">`,
    expected: VIDEO_OUT,
  },
  {
    name: 'track com javascript:',
    input: `<video src="${VIDEO}"><track src="javascript:alert(1)" kind="captions"></video>`,
    expected: VIDEO_OUT,
  },
  {
    name: 'img relativa sem allowRelativeMedia',
    input: '<img src="/a.jpg">',
    expected: '',
    options: { allowRelativeMedia: false },
  },
  {
    name: 'img de host fora de mediaHosts',
    input: '<img src="https://evil.test/a.jpg">',
    expected: '',
    options: { mediaHosts: ['cdn.example.com'] },
  },
  {
    name: 'img de host em mediaHosts',
    input: '<img src="https://cdn.example.com/a.jpg" onload="alert(1)">',
    expected: '<img src="https://cdn.example.com/a.jpg" alt="">',
    options: { mediaHosts: ['cdn.example.com'] },
  },
  {
    name: 'href de subdomínio bloqueado',
    input: '<a href="https://a.evil.test/">x</a>',
    expected: 'x',
    options: { linkPolicy: { blockedDomains: ['evil.test'] } },
  },
  {
    name: 'a inacabado no fim da entrada',
    input: '<p>x</p><a href="javascript:alert(1)"',
    expected: '<p>x</p>',
  },
  {
    name: 'href com NUL literal',
    input: '<a href="java\0script:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'href relativo com TAB que vira //',
    input: '<a href="/&#9;/evil.test/">x</a>',
    expected: 'x',
  },
  {
    name: 'href tel: com javascript:',
    input: '<a href="tel:javascript:alert(1)">x</a>',
    expected: 'x',
  },
  {
    name: 'fragmento com marcação sai escapado',
    input: '<a href="#&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a>',
    expected:
      '<a href="#&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a>',
  },
  {
    name: 'href sem aspas com aspas em entidade',
    input: '<a href=https://example.com/&quot;onclick=alert(1)>x</a>',
    expected: '<a href="https://example.com/%22onclick=alert(1)">x</a>',
  },
];

const srcset: Draft[] = [
  {
    name: 'candidato javascript: depois de um válido',
    input: `<img src="${IMG}" srcset="${IMG} 1x, javascript:alert(1) 2x">`,
    expected: IMG_OUT,
  },
  {
    name: 'só javascript:',
    input: `<img src="${IMG}" srcset="javascript:alert(1)">`,
    expected: IMG_OUT,
  },
  {
    name: 'data:',
    input: `<img src="${IMG}" srcset="data:image/png;base64,AAAA 1x">`,
    expected: IMG_OUT,
  },
  {
    name: 'candidato relativo ao protocolo',
    input: `<img src="${IMG}" srcset="${IMG} 1x, //evil.test/b.jpg 2x">`,
    expected: IMG_OUT,
  },
  {
    name: 'javascript: sem espaço depois da vírgula',
    input: `<img src="${IMG}" srcset="${IMG} 1x,javascript:alert(1) 2x">`,
    expected: IMG_OUT,
  },
  {
    name: 'javascript: com TAB em entidade',
    input: `<img src="${IMG}" srcset="jav&#x09;ascript:alert(1) 1x">`,
    expected: IMG_OUT,
  },
  {
    name: 'http: (mídia só https)',
    input: `<img src="${IMG}" srcset="http://example.com/a.jpg 1x">`,
    expected: IMG_OUT,
  },
  {
    name: 'candidato relativo sem allowRelativeMedia',
    input: `<img src="${IMG}" srcset="${IMG} 1x, /b.jpg 2x">`,
    expected: IMG_OUT,
    options: { allowRelativeMedia: false },
  },
  {
    name: 'válido fica',
    input: `<img src="${IMG}" srcset="${IMG} 1x, https://example.com/b.jpg 2x" onerror="alert(1)">`,
    expected: `<img src="${IMG}" srcset="${IMG} 1x, https://example.com/b.jpg 2x" alt="">`,
  },
  {
    name: 'sizes com marcação sai',
    input: `<img src="${IMG}" srcset="${IMG} 600w" sizes="<script>alert(1)</script>">`,
    expected: `<img src="${IMG}" srcset="${IMG} 600w" alt="">`,
  },
  {
    name: 'vírgula sem espaço fica dentro da URL',
    input: `<img src="${IMG}" srcset="${IMG},javascript:alert(1)">`,
    expected: IMG_OUT,
  },
  {
    name: 'descritor extra com javascript:',
    input: `<img src="${IMG}" srcset="${IMG} 1x javascript:alert(1)">`,
    expected: IMG_OUT,
  },
];

const style: Draft[] = [
  {
    name: 'url(javascript:) tira só a declaração',
    input:
      '<p style="background:url(javascript:alert(1)); text-align: center">x</p>',
    expected: '<p style="text-align: center">x</p>',
  },
  {
    name: 'expression tira o estilo inteiro',
    input: '<p style="text-align: center; x: expression(alert(1))">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: 'url(https:) também sai',
    input:
      '<p style="text-align: center; background: url(https://evil.test/x)">x</p>',
    expected: '<p style="text-align: center">x</p>',
  },
  {
    name: 'barra invertida tira o estilo inteiro',
    input: '<p style="text-align: center\\;">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: 'escape CSS no valor',
    input: '<p style="text-align: cen\\74 er">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: 'comentário CSS',
    input: '<p style="text-align: center /* x */">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: '!important',
    input: '<p style="text-align: center !important">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: 'image-set(',
    input: `<p style="text-align: image-set('javascript:alert(1)' 1x)">x</p>`,
    expected: '<p>x</p>',
  },
  {
    name: '@import',
    input:
      '<p style="text-align: center; @import \'https://evil.test/x.css\'">x</p>',
    expected: '<p style="text-align: center">x</p>',
  },
  {
    name: '-moz-binding',
    input:
      '<p style="-moz-binding: url(https://evil.test/x.xml#xss); text-align: left">x</p>',
    expected: '<p style="text-align: left">x</p>',
  },
  {
    name: 'behavior',
    input: '<p style="behavior: url(x.htc); text-align: right">x</p>',
    expected: '<p style="text-align: right">x</p>',
  },
  {
    name: 'expression em entidade',
    input:
      '<p style="text-align: center; text-align: expre&#x73;sion(alert(1))">x</p>',
    expected: '<p>x</p>',
  },
  {
    name: 'propriedades fora do esquema',
    input:
      '<p style="text-align: center; color: red; position: fixed; top: 0">x</p>',
    expected: '<p style="text-align: center">x</p>',
  },
  {
    name: 'fechamento de bloco CSS',
    input:
      '<h2 style="text-align: center;}body{background:url(javascript:alert(1))">x</h2>',
    expected: '<h2 style="text-align: center">x</h2>',
  },
  {
    name: 'span com styleFrom ignora o style da entrada',
    input:
      '<span data-rt-color="red" style="color: url(javascript:alert(1))">x</span>',
    expected: '<span data-rt-color="red" style="color: #b3261e">x</span>',
  },
  {
    name: 'mark com styleFrom ignora o style da entrada',
    input:
      '<mark data-rt-color="yellow" style="background: url(javascript:alert(1))">x</mark>',
    expected:
      '<mark data-rt-color="yellow" style="background-color: #fff3a3">x</mark>',
  },
  {
    name: 'col com url( na largura',
    input:
      '<table><colgroup><col style="width: 100px; width: url(x)"></colgroup><tr><td>a</td></tr></table>',
    expected:
      '<table><colgroup><col style="width: 100px"></colgroup><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'barra invertida em entidade',
    input: '<p style="text-align: center; x: u&#x5c;72l(x)">x</p>',
    expected: '<p>x</p>',
  },
];

/** Um caso de `on*` por tag do esquema, no contexto em que ela é aceita. */
const handlers: Draft[] = [
  {
    name: 'img com onerror',
    input: '<img src=x onerror=alert(1)>',
    expected: '',
  },
  {
    name: 'input com onfocus e autofocus',
    input: '<input type="checkbox" onfocus="alert(1)" autofocus>',
    expected: TASK_INPUT_OUT,
  },
  {
    name: 'p',
    input: `<p onclick="${ALERT}">x</p>`,
    expected: '<p>x</p>',
  },
  {
    name: 'h2',
    input: `<h2 id="rt-a" onmouseover="${ALERT}">x</h2>`,
    expected: '<h2 id="rt-a">x</h2>',
  },
  {
    name: 'h3',
    input: `<h3 ONCLICK="${ALERT}">x</h3>`,
    expected: '<h3>x</h3>',
  },
  {
    name: 'h4',
    input: `<h4 onanimationstart="${ALERT}" style="animation-name: x; text-align: right">x</h4>`,
    expected: '<h4 style="text-align: right">x</h4>',
  },
  {
    name: 'ul',
    input: `<ul onclick="${ALERT}"><li>x</li></ul>`,
    expected: '<ul><li>x</li></ul>',
  },
  {
    name: 'ol',
    input: `<ol onclick=${ALERT} start="2"><li>x</li></ol>`,
    expected: '<ol start="2"><li>x</li></ol>',
  },
  {
    name: 'li',
    input: `<ul><li onpointerenter="${ALERT}">x</li></ul>`,
    expected: '<ul><li>x</li></ul>',
  },
  {
    name: 'blockquote',
    input: `<blockquote onfocus="${ALERT}" tabindex="1" autofocus>x</blockquote>`,
    expected: '<blockquote>x</blockquote>',
  },
  {
    name: 'hr',
    input: `<hr onclick="${ALERT}">`,
    expected: '<hr>',
  },
  {
    name: 'br',
    input: `a<br onclick="${ALERT}">b`,
    expected: 'a<br>b',
  },
  {
    name: 'strong',
    input: `<strong onclick="${ALERT}">x</strong>`,
    expected: '<strong>x</strong>',
  },
  {
    name: 'em',
    input: `<em onmouseover="${ALERT}">x</em>`,
    expected: '<em>x</em>',
  },
  {
    name: 'u',
    input: `<u oncopy="${ALERT}">x</u>`,
    expected: '<u>x</u>',
  },
  {
    name: 's',
    input: `<s onbeforetoggle="${ALERT}" popover>x</s>`,
    expected: '<s>x</s>',
  },
  {
    name: 'code',
    input: `<code onscrollend="${ALERT}">x</code>`,
    expected: '<code>x</code>',
  },
  {
    name: 'sup',
    input: `<sup oncontentvisibilityautostatechange="${ALERT}" style="content-visibility: auto">x</sup>`,
    expected: '<sup>x</sup>',
  },
  {
    name: 'sub',
    input: `<sub onauxclick="${ALERT}">x</sub>`,
    expected: '<sub>x</sub>',
  },
  {
    name: 'a',
    input: `<a href="https://example.com/" onclick="${ALERT}">x</a>`,
    expected: '<a href="https://example.com/">x</a>',
  },
  {
    name: 'span',
    input: `<span onmouseover="${ALERT}" data-rt-color="red">x</span>`,
    expected: '<span data-rt-color="red" style="color: #b3261e">x</span>',
  },
  {
    name: 'mark',
    input: `<mark onclick=${ALERT} data-rt-color="green">x</mark>`,
    expected:
      '<mark data-rt-color="green" style="background-color: #ccf2d1">x</mark>',
  },
  {
    name: 'pre',
    input: `<pre onclick="${ALERT}">x</pre>`,
    expected: '<pre>x</pre>',
  },
  {
    name: 'code com classe de linguagem',
    input: `<pre><code class="language-js" onclick="${ALERT}">x</code></pre>`,
    expected: '<pre><code class="language-js">x</code></pre>',
  },
  {
    name: 'table',
    input: `<table onclick="${ALERT}"><tr><td>a</td></tr></table>`,
    expected: '<table><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'caption',
    input: `<table><caption onclick="${ALERT}">c</caption><tr><td>a</td></tr></table>`,
    expected:
      '<table><caption>c</caption><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'colgroup',
    input: `<table><colgroup onclick="${ALERT}"><col></colgroup><tr><td>a</td></tr></table>`,
    expected:
      '<table><colgroup><col></colgroup><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'col',
    input: `<table><colgroup><col onclick="${ALERT}" style="width: 120px"></colgroup><tr><td>a</td></tr></table>`,
    expected:
      '<table><colgroup><col style="width: 120px"></colgroup><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'thead',
    input: `<table><thead onclick="${ALERT}"><tr><th>h</th></tr></thead></table>`,
    expected: '<table><thead><tr><th>h</th></tr></thead></table>',
  },
  {
    name: 'tbody',
    input: `<table><tbody onclick="${ALERT}"><tr><td>a</td></tr></tbody></table>`,
    expected: '<table><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'tr',
    input: `<table><tbody><tr onclick="${ALERT}"><td>a</td></tr></tbody></table>`,
    expected: '<table><tbody><tr><td>a</td></tr></tbody></table>',
  },
  {
    name: 'th',
    input: `<table><tbody><tr><th onclick="${ALERT}" scope="row">h</th></tr></tbody></table>`,
    expected: '<table><tbody><tr><th scope="row">h</th></tr></tbody></table>',
  },
  {
    name: 'td',
    input: `<table><tbody><tr><td onclick="${ALERT}" colspan="2">a</td></tr></tbody></table>`,
    expected: '<table><tbody><tr><td colspan="2">a</td></tr></tbody></table>',
  },
  {
    name: 'label e input da tarefa',
    input: `<ul class="rt-tasks"><li class="rt-task"><label onclick="${ALERT}"><input type="checkbox" onchange="${ALERT}" checked>feita</label></li></ul>`,
    expected: `<ul class="rt-tasks"><li class="rt-task"><label><input type="checkbox" checked="" disabled="">feita</label></li></ul>`,
  },
  {
    name: 'figure, img, figcaption e small',
    input: `<figure class="rt-figure" onclick="${ALERT}"><img src="${IMG}" alt="a" onload="${ALERT}"><figcaption onclick="${ALERT}">c <small class="rt-credit" onclick="${ALERT}">f</small></figcaption></figure>`,
    expected: `<figure class="rt-figure"><img src="${IMG}" alt="a"><figcaption>c <small class="rt-credit">f</small></figcaption></figure>`,
  },
  {
    name: 'video e track',
    input: `<video src="${VIDEO}" onloadstart="${ALERT}"><track kind="captions" src="https://example.com/v.vtt" onload="${ALERT}"></video>`,
    expected: `<video src="${VIDEO}" controls=""><track kind="captions" src="https://example.com/v.vtt"></video>`,
  },
  {
    name: 'iframe com onload',
    input: `<iframe src="${YOUTUBE}" title="v" onload="${ALERT}"></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'cite',
    input: `<figure class="rt-pullquote"><blockquote><p>q</p></blockquote><figcaption><cite onclick="${ALERT}">a</cite></figcaption></figure>`,
    expected:
      '<figure class="rt-pullquote"><blockquote><p>q</p></blockquote><figcaption><cite>a</cite></figcaption></figure>',
  },
  {
    name: 'aside',
    input: `<aside class="rt-callout rt-callout--info" role="note" onmouseenter="${ALERT}"><p>x</p></aside>`,
    expected:
      '<aside class="rt-callout rt-callout--info" role="note"><p>x</p></aside>',
  },
  {
    name: 'handler com barra antes do nome',
    input: `<p/onclick="${ALERT}">x</p>`,
    expected: '<p>x</p>',
  },
  {
    name: 'handler repetido depois de atributo válido',
    input: `<ol start="3" start="4" onclick="${ALERT}" onclick="${ALERT}"><li>x</li></ol>`,
    expected: '<ol start="3"><li>x</li></ol>',
  },
  {
    name: 'handler colado depois de aspas',
    input: `<img src="${IMG}" alt="x"onerror="${ALERT}">`,
    expected: `<img src="${IMG}" alt="x">`,
  },
  {
    name: 'handler separado por form feed',
    input: `<a href="https://example.com/"\fonclick=${ALERT}>x</a>`,
    expected: '<a href="https://example.com/">x</a>',
  },
];

const elements: Draft[] = [
  {
    name: 'base, meta refresh e link import',
    input:
      '<base href="https://evil.test/"><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><link rel=import href=x>ok',
    expected: 'ok',
  },
  {
    name: 'form action e button formaction',
    input:
      '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">x</button></form>',
    expected: 'x',
  },
  {
    name: 'base javascript: com link relativo',
    input: '<base href="javascript:alert(1)//"><a href="/x">x</a>',
    expected: '<a href="/x">x</a>',
  },
  {
    name: 'object com data javascript:',
    input: '<object data="javascript:alert(1)">x</object>y',
    expected: 'y',
  },
  {
    name: 'object com param',
    input:
      '<object type="text/html" data="https://evil.test/"><param name="x" value="y">fallback</object>',
    expected: '',
  },
  {
    name: 'embed',
    input: '<embed src="javascript:alert(1)">y',
    expected: 'y',
  },
  {
    name: 'applet é desembrulhado',
    input: '<applet code="x.class" onload="alert(1)">x</applet>y',
    expected: 'xy',
  },
  {
    name: 'script e p',
    input: '<script>alert(1)</script><p>ok</p>',
    expected: '<p>ok</p>',
  },
  {
    name: 'style com @import',
    input: "<style>@import 'https://evil.test/x.css';</style><p>ok</p>",
    expected: '<p>ok</p>',
  },
  {
    name: 'svg com a xlink:href',
    input: '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    expected: '',
  },
  {
    name: 'math com href',
    input: '<math href="javascript:alert(1)">x</math>',
    expected: '',
  },
  {
    name: 'details com ontoggle',
    input: '<details open ontoggle="alert(1)"><summary>s</summary>x</details>',
    expected: 'sx',
  },
  {
    name: 'select com autofocus',
    input: '<select autofocus onfocus="alert(1)"><option>x</option></select>',
    expected: 'x',
  },
  {
    name: 'textarea com autofocus',
    input: '<textarea autofocus onfocus="alert(1)">x</textarea>',
    expected: '',
  },
  {
    name: 'audio com onerror',
    input: '<audio src=x onerror=alert(1)>',
    expected: '',
  },
  {
    name: 'video sem src com source',
    input: '<video><source onerror="alert(1)"></video>',
    expected: '',
  },
  {
    name: 'isindex',
    input: '<isindex action="javascript:alert(1)" type="image">',
    expected: '',
  },
  {
    name: 'img com mídia desligada',
    input: `<img src="${IMG}">`,
    expected: '',
    options: { features: { media: false } },
  },
  {
    name: 'input com tarefas desligadas',
    input: '<input type="checkbox">',
    expected: '',
    options: { features: { tasks: false } },
  },
  {
    name: 'tabela com tabelas desligadas',
    input: '<table><tr><td onclick="alert(1)">a</td></tr></table>',
    expected: 'a',
    options: { features: { tables: false } },
  },
  {
    name: 'documento inteiro com body onload',
    input:
      '<!DOCTYPE html><html><head><title>x</title></head><body onload=alert(1)><p>ok</p></body></html>',
    expected: '<p>ok</p>',
  },
  {
    name: 'img depois de </body>',
    input: '<p>a</p></body><img src=x onerror=alert(1)></html><p>b</p>',
    expected: '<p>a</p><p>b</p>',
  },
  {
    name: 'frameset com noframes',
    input:
      '<frameset><frame src="javascript:alert(1)"><noframes><p>x</p></noframes></frameset>',
    expected: '',
  },
  {
    name: 'image (alias de img)',
    input: '<image src=x onerror=alert(1)>',
    expected: '',
  },
];

const iframe: Draft[] = [
  {
    name: 'iframe de outro host',
    input: '<iframe src="https://evil.test/embed/x" title="v"></iframe>',
    expected: '',
  },
  {
    name: 'srcdoc sai',
    input: `<iframe srcdoc="<script>alert(1)</script>" src="${YOUTUBE}" title="v"></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'sandbox afrouxado volta ao padrão',
    input: `<iframe src="${YOUTUBE}" title="v" sandbox="allow-scripts allow-same-origin allow-top-navigation"></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'sandbox vazio volta ao padrão',
    input: `<iframe sandbox src="${YOUTUBE}" title="v"></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'allow e referrerpolicy trocados voltam ao padrão',
    input: `<iframe src="${YOUTUBE}" title="v" allow="camera; microphone" referrerpolicy="unsafe-url"></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'iframe javascript:',
    input: '<iframe src="javascript:alert(1)" title="v"></iframe>',
    expected: '',
  },
  {
    name: 'iframe data:',
    input:
      '<iframe src="data:text/html,<script>alert(1)</script>" title="v"></iframe>',
    expected: '',
  },
  {
    name: 'youtube com parâmetro fora do padrão',
    input: `<iframe src="${YOUTUBE}?autoplay=1" title="v"></iframe>`,
    expected: '',
  },
  {
    name: 'youtube.com com cookies',
    input:
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="v"></iframe>',
    expected: '',
  },
  {
    name: 'host do provedor como subdomínio de outro',
    input:
      '<iframe src="https://www.youtube-nocookie.com.evil.test/embed/dQw4w9WgXcQ" title="v"></iframe>',
    expected: '',
  },
  {
    name: 'conteúdo do iframe sai',
    input: `<iframe src="${YOUTUBE}" title="v"><script>alert(1)</script><p>x</p></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'iframe sem title sai',
    input: `<iframe src="${YOUTUBE}"></iframe>`,
    expected: '',
  },
  {
    name: 'style do iframe sem url(',
    input: `<iframe src="${YOUTUBE}" title="v" style="aspect-ratio: 16 / 9; background: url(javascript:alert(1))"></iframe>`,
    expected: `<iframe src="${YOUTUBE}" title="v" style="aspect-ratio: 16 / 9"${IFRAME_FIXED}></iframe>`,
  },
  {
    name: 'embeds desligados',
    input: `<iframe src="${YOUTUBE}" title="v"></iframe>`,
    expected: '',
    options: { features: { embeds: false } },
  },
  {
    name: 'vimeo com ../ no caminho',
    input:
      '<iframe src="https://player.vimeo.com/video/76979871/../../../evil" title="v"></iframe>',
    expected: '',
  },
  {
    name: 'youtube com fragmento',
    input: `<iframe src="${YOUTUBE}#x" title="v"></iframe>`,
    expected: '',
  },
  {
    name: 'embed completo continua igual',
    input: `<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube" onclick="alert(1)"><iframe src="${YOUTUBE}" title="v" name="top"></iframe></figure>`,
    expected: `<figure class="rt-embed rt-embed--youtube" data-rt-provider="youtube">${YOUTUBE_OUT}</figure>`,
  },
  {
    name: 'src repetido: vale o primeiro',
    input: `<iframe src="${YOUTUBE}" src="javascript:alert(1)" title="v"></iframe>`,
    expected: YOUTUBE_OUT,
  },
  {
    name: 'csp, credentialless e allowfullscreen com valor',
    input: `<iframe src="${YOUTUBE}" title="v" csp="script-src *" credentialless allowfullscreen="javascript:alert(1)"></iframe>`,
    expected: `<iframe src="${YOUTUBE}" title="v" allowfullscreen=""${IFRAME_FIXED}></iframe>`,
  },
];

const clobbering: Draft[] = [
  {
    name: 'img com id e name, e id repetido',
    input: `<img src="${IMG}" id="getElementById" name="x"><h2 id="rt-a">a</h2><h2 id="rt-a">b</h2>`,
    expected: `${IMG_OUT}<h2 id="rt-a">a</h2><h2>b</h2>`,
  },
  {
    name: 'id sem o prefixo',
    input: '<h2 id="cookie">x</h2>',
    expected: '<h2>x</h2>',
  },
  {
    name: 'name em título',
    input: '<h2 id="rt-a" name="rt-a">x</h2>',
    expected: '<h2 id="rt-a">x</h2>',
  },
  {
    name: 'form e input com name',
    input:
      '<form name="getElementById"><input name="attributes" type="checkbox"></form>',
    expected: TASK_INPUT_OUT,
  },
  {
    name: 'a com id e name',
    input:
      '<a id="defaultView" name="location" href="https://example.com/">x</a>',
    expected: '<a href="https://example.com/">x</a>',
  },
  {
    name: 'id em p',
    input: '<p id="x">a</p>',
    expected: '<p>a</p>',
  },
  {
    name: 'id com __proto__',
    input: '<h2 id="rt-__proto__">x</h2>',
    expected: '<h2>x</h2>',
  },
  {
    name: 'id em maiúsculas',
    input: '<h3 ID="RT-A">x</h3>',
    expected: '<h3>x</h3>',
  },
  {
    name: 'id repetido em três títulos',
    input: '<h2 id="rt-a">a</h2><h3 id="rt-a">b</h3><h4 id="rt-a">c</h4>',
    expected: '<h2 id="rt-a">a</h2><h3>b</h3><h4>c</h4>',
  },
  {
    name: 'id com o prefixo padrão quando o prefixo é outro',
    input: '<h2 id="rt-a">x</h2><h2 id="doc-a">y</h2>',
    expected: '<h2>x</h2><h2 id="doc-a">y</h2>',
    options: { idPrefix: 'doc-' },
  },
];

const tabnabbing: Draft[] = [
  {
    name: 'rel=opener com target=_blank',
    input: '<a href="https://example.com/" target="_blank" rel="opener">x</a>',
    expected:
      '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a>',
  },
  {
    name: 'target=_blank sem rel',
    input: '<a href="https://example.com/" target="_blank">x</a>',
    expected:
      '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a>',
  },
  {
    name: 'target=_BLANK é normalizado e ganha rel',
    input: '<a href="https://example.com/" target="_BLANK">x</a>',
    expected:
      '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a>',
  },
  {
    name: 'target com nome de janela sai',
    input: '<a href="https://example.com/" target="evilwindow">x</a>',
    expected: '<a href="https://example.com/">x</a>',
  },
  {
    name: 'rel nofollow ganha noopener noreferrer',
    input:
      '<a href="https://example.com/" target="_blank" rel="nofollow">x</a>',
    expected:
      '<a href="https://example.com/" target="_blank" rel="nofollow noopener noreferrer">x</a>',
  },
  {
    name: 'rel antes do target',
    input:
      '<a href="https://example.com/" rel="noopener noreferrer opener" target="_blank">x</a>',
    expected:
      '<a href="https://example.com/" rel="noopener noreferrer" target="_blank">x</a>',
  },
  {
    name: 'target antes do href',
    input: '<a target="_blank" href="https://example.com/">x</a>',
    expected:
      '<a target="_blank" href="https://example.com/" rel="noopener noreferrer">x</a>',
  },
  {
    name: 'forceRel com target=_blank',
    input: '<a href="https://example.com/" target="_blank" rel="opener">x</a>',
    expected:
      '<a href="https://example.com/" target="_blank" rel="nofollow noopener noreferrer">x</a>',
    options: { linkPolicy: { forceRel: ['nofollow'] } },
  },
];

const proto: Draft[] = [
  {
    name: 'data-rt-color constructor',
    input: '<span data-rt-color="constructor" style="color: red">x</span>',
    expected: '<span>x</span>',
  },
  {
    name: 'data-rt-color __proto__ em mark',
    input: '<mark data-rt-color="__proto__">x</mark>',
    expected: '<mark>x</mark>',
  },
  {
    name: 'data-rt-color hasOwnProperty',
    input: '<mark data-rt-color="hasOwnProperty">x</mark>',
    expected: '<mark>x</mark>',
  },
  {
    name: 'data-rt-color toString',
    input: '<span data-rt-color="toString">x</span>',
    expected: '<span>x</span>',
  },
  {
    name: 'tag constructor',
    input: '<constructor onclick="alert(1)">x</constructor>',
    expected: 'x',
  },
  {
    name: 'tag toString',
    input: '<toString>x</toString>',
    expected: 'x',
  },
  {
    name: 'tag hasOwnProperty',
    input: '<hasOwnProperty>x</hasOwnProperty>',
    expected: 'x',
  },
  {
    name: 'atributos com nomes do protótipo',
    input: '<p __proto__="x" constructor="y" toString="z">a</p>',
    expected: '<p>a</p>',
  },
  {
    name: 'classes com nomes do protótipo',
    input: '<ul class="__proto__ constructor rt-tasks"><li>x</li></ul>',
    expected: '<ul class="rt-tasks"><li>x</li></ul>',
  },
  {
    name: 'input com atributos do protótipo',
    input: '<input type="checkbox" constructor __proto__ valueOf>',
    expected: TASK_INPUT_OUT,
  },
];

const tag = (category: XssCategory, cases: Draft[]): XssCase[] =>
  cases.map((c) => ({ ...c, category }));

/** Corpus completo, com nomes únicos por categoria. */
export const XSS_CORPUS: readonly XssCase[] = [
  ...tag('owasp', owasp),
  ...tag('mxss', mxss),
  ...tag('url', url),
  ...tag('srcset', srcset),
  ...tag('style', style),
  ...tag('handlers', handlers),
  ...tag('elements', elements),
  ...tag('iframe', iframe),
  ...tag('clobbering', clobbering),
  ...tag('tabnabbing', tabnabbing),
  ...tag('proto', proto),
];
