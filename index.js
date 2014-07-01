
var sweet = require('sweet.js');
var helperMacro = sweet.loadNodeModule(__dirname, './jsx-macro.js');

// Error handling

function JSXBailError(message) {
  this.message = message;
}

// A helper buffer class

function TokenBuffer(reader) {
  this.reader = reader;
  this.buffer = [];
}

TokenBuffer.prototype = {
  add: function(toks) {
    if(Array.isArray(toks)) {
      this.buffer = this.buffer.concat(toks);
    }
    else {
      this.buffer.push(toks);
    }
  },

  finish:  function() {
    var buf = this.buffer;
    this.buffer = [];
    return buf;
  },

  reset: function() {
    this.buffer = [];
  },

  expect: function(ch) {
    var reader = this.reader;
    if(reader.index >= reader.length) {
      throw new JSXBailError('bailed since end of file found');
    }

    var punc = reader.getQueued();
    if(!punc) {
        punc = reader.suppressReadError(reader.readPunctuator);
    }

    if(!punc ||
       (punc.type !== reader.Token.Punctuator &&
        punc.value !== ch)) {
      throw new Error(
        'wanted `' + ch +
          '` but got `' +
          reader.source.slice(reader.index, reader.index+5) +
          '`'
      );
    }
    return punc;
  },

  match: function(/* ch1, ch2, ... chN */) {
    var chars = Array.prototype.slice.call(arguments);
    var reader = this.reader;
    var prevState = {
      index: reader.index
    };
    var matched = true;

    // First, we need to walk through any tokens that are queued
    // in the readtable. This can happen because readtables can be
    // recursively called, so there might be some tokens we need
    // to check here first.
    for(var i=0; i<chars.length; i++) {
      var tok = reader.peekQueued(i);
      if(!tok) {
        break;
      }

      matched = (matched &&
                 tok.type === reader.Token.Punctuator &&
                 tok.value === chars[i]);
    }

    for(i; i<chars.length; i++) {
        var punc = reader.suppressReadError(reader.readPunctuator);
        matched = matched && punc && punc.value === chars[i];
    }

    reader.index = prevState.index;
    return matched;
  },

  watchTokens: function(func) {
    var i = this.buffer.length;
    func();
    return this.buffer.slice(i);
  },

  getTokens: function(func) {
    var i = this.buffer.length;
    func();
    var toks = this.buffer.slice(i);
    this.buffer = this.buffer.slice(0, i);
    return toks;
  }
};

function JSXReader(reader) {
  this.reader = reader;
  this.buffer = new TokenBuffer(reader);
}

JSXReader.prototype = {
  expect: function() {
    return this.buffer.expect.apply(this.buffer, arguments);
  },

  match: function(ch) {
    return this.buffer.match.apply(this.buffer, arguments);
  },

  read: function() {
    var reader = this.reader;
    var Token = reader.Token;
    var start = reader.index;

    try {
      var innerTokens = this.buffer.getTokens(function() {
        this.readElement();
      }.bind(this));
    }
    catch(e) {
      if(!(e instanceof JSXBailError)) {
        throw e;
      }
      this.buffer.reset();
      return;
    }

    var tokens = [
        reader.makeIdentifier('DOM', { start: start }),
        reader.makeDelimiter('{}', innerTokens)
    ];

    // Invoke our helper macro
    var expanded = sweet.expandSyntax(tokens, [helperMacro])
    this.buffer.add(expanded);
  },

  readElement: function() {
    function tokReduce(acc, tok) {
      return acc + tok.value;
    }

    var reader = this.reader;
    var Token = reader.Token, selfClosing;
    var openingNameToks = this.buffer.watchTokens(function() {
      selfClosing = this.readOpeningElement();
    }.bind(this));

    // The opening name includes any attributes as the last
    // token, so pull it off
    var openingName = openingNameToks.slice(0, -1)
        .reduce(tokReduce, '');

    if(!selfClosing) {
      while(this.reader.index < this.reader.length) {
        if(this.match('<', '/')) {
          break;
        }

        this.readChild();
      }

      var closingNameToks = this.buffer.getTokens(
        this.readClosingElement.bind(this)
      );
      var closingName = closingNameToks.reduce(tokReduce, '');

      if(openingName !== closingName) {
        this.reader.throwSyntaxError(
          'JSX',
          'Expected correspoding closing tag for ' + openingName,
          closingNameToks[0]
        )
      }
    }

    if(JSXTAGS[openingName]) {
      openingNameToks[0].value = 'React.DOM.' + openingName;
    }

    // TODO: throw error if top-level elements are found right beside
    // each other (<div /><div />)
  },

  readOpeningElement: function() {
    var reader = this.reader;
    var selfClosing = false;
    var start = reader.index;

    this.expect('<');
    this.readElementName();
    reader.skipComment();

    var tokens = this.buffer.getTokens(function() {
      var end = false;

      while(reader.index < reader.length &&
            !this.match('/') &&
            !this.match('>')) {
        this.readAttribute();
        end = this.match('/') || this.match('>');
        if(!end) {
            this.buffer.add(reader.makePunctuator(','));
        }
      }
    }.bind(this));

    if(tokens.length) {
      this.buffer.add(reader.makeDelimiter('{}', tokens));
    }
    else {
      this.buffer.add(reader.makeIdentifier('null'));
    }

    reader.skipComment();
    if(this.match('/')) {
      selfClosing = true;
      this.expect('/');
    }
    this.expect('>');

    return selfClosing;
  },

  readClosingElement: function() {
    var reader = this.reader;
    this.expect('<');

    if(reader.suppressReadError(reader.readRegExp)) {
      throw new JSXBailError('bailed because regexp found ' +
                             'at closing element');
    }

    this.expect('/');
    this.readElementName();
    this.expect('>');
  },

  readChild: function() {
    if(this.match('{')) {
      this.readExpressionContainer();
    }
    else if(this.match('<')) {
      this.read();
    }
    else {
      var start = this.reader.index;
      var toks = this.buffer.getTokens(function() {
        this.readText(['{', '<']);
      }.bind(this));
      this.renderLiteral(toks[0].value);
    }
  },

  renderLiteral: function(str) {
    var lines = str.split(/\r\n|\n|\r/);
    var output = [];

    lines.forEach(function(line, index) {
      var isFirstLine = index === 0;
      var isLastLine = index === lines.length - 1;

      // replace rendered whitespace tabs with spaces
      var trimmedLine = line.replace(/\t/g, ' ');

      // trim whitespace touching a newline
      if(!isFirstLine) {
        trimmedLine = trimmedLine.replace(/^[ ]+/, '');
      }
      if(!isLastLine) {
        trimmedLine = trimmedLine.replace(/[ ]+$/, '');
      }

      if(trimmedLine) {
        output.push(trimmedLine);
      }
    });

    var reader = this.reader;
    // We don't care where this starts, because it should never error
    // (no user code), but we need to give it a valid starting
    // location for source maps
    var tokOpts = { start: reader.index };
    output.forEach(function(str, i) {
      if(i !== 0) {
        this.buffer.add(reader.makePunctuator('+', tokOpts));
        this.buffer.add(reader.makeStringLiteral(' ', tokOpts));
        this.buffer.add(reader.makePunctuator('+', tokOpts));
      }
      this.buffer.add(reader.makeStringLiteral(str, tokOpts));
    }.bind(this));
  },

  readText: function(stopChars) {
    var reader = this.reader;
    var ch, str = '';
    var source = reader.source;
    var start = reader.index;

    while(reader.index < reader.length) {
      ch = source[reader.index];
      if(stopChars.indexOf(ch) !== -1) {
        break;
      }

      if(ch === '&') {
        str += this.readEntity();
      }
      else {
        reader.index++;
        if(reader.isLineTerminator(ch.charCodeAt(0))) {
          reader.lineNumber++;
          reader.lineStart = reader.index;
        }
        str += ch;
      }
    }

    this.buffer.add(
      reader.makeStringLiteral(str, { start: start })
    );
  },

  readEntity: function() {
    var reader = this.reader;
    var source = reader.source;
    var ch = source[reader.index];
    var str = '', count = 0, entity;

    if(ch !== '&') {
      reader.throwSyntaxError('JSX',
                              'Entity must start with an ampersand',
                              reader.readToken());
    }
    reader.index++;

    while(reader.index < reader.length && count < 10) {
      ch = source[reader.index++];
      if(ch === ';') {
        break;
      }
      str += ch;
      count++;
    }

    if (str[0] === '#' && str[1] === 'x') {
      entity = String.fromCharCode(parseInt(str.substr(2), 16));
    } else if (str[0] === '#') {
      entity = String.fromCharCode(parseInt(str.substr(1), 10));
    } else {
      entity = XHTMLEntities[str];
    }

    return entity;
  },

  readElementName: function() {
    var reader = this.reader;
    var ch = reader.source[reader.index];

    if(!reader.isIdentifierStart(ch.charCodeAt(0))) {
      throw new JSXBailError('bailed while reading element ' +
                             'name: ' + ch);
    }

    this.readIdentifier();

    if(this.match(':')) {
      this.readPunc();
      this.readIdentifier();
    }
    if(this.match('.')) {
      this.readMemberParts();
    }
  },

  readAttribute: function() {
    var hasValue = false;
    this.readIdentifier();

    if(this.match(':')) {
      this.readPunc();
      this.readIdentifier();
    }

    if((hasValue = this.match('='))) {
      this.expect('=');
    }

    this.buffer.add(this.reader.makePunctuator(':'));

    if(hasValue) {
      this.readAttributeValue();
    }
    else {
      this.buffer.add(this.reader.makeIdentifier('true'));
    }

    this.reader.skipComment();
  },

  readAttributeValue: function() {
    var reader = this.reader;

    if(this.match('{')) {
      this.readExpressionContainer();
      // TODO
      //throw new Error("can't be empty");
    }
    else if(this.match('<')) {
      this.read();
    }
    else {
      var quote = reader.source[reader.index];
      var start = reader.index;

      if(quote !== '"' && quote !== "'") {
        reader.throwSyntaxError(
          'JSX',
          'attributes should be an expression or quoted text',
          reader.readToken()
        );
      }

      reader.index = start + 1;
      this.readText([quote]);
      if(quote !== reader.source[reader.index]) {
        reader.throwSyntaxError(
          'JSX',
          'badly quoted string',
          reader.readToken()
        );
      }
      reader.index++;
    }
  },

  readExpressionContainer: function() {
    var reader = this.reader;
    this.expect('{');
    this.reader.skipComment();

    while(!this.match('}')) {
      this.buffer.add(this.reader.readToken());
      this.reader.skipComment();
    }

    this.expect('}');
  },

  readMemberParts: function() {
    while(this.match('.')) {
      this.readPunc();
      this.readIdentifier();
    }
  },

  readIdentifier: function() {
    var reader = this.reader;
    reader.skipComment();

    var source = reader.source;
    var ch, start, value = '';
    var chCode = source[reader.index].charCodeAt(0);

    if(chCode === 92 || !reader.isIdentifierStart(chCode)) {
      throw new JSXBailError('bailed while reading identifier: ' +
                             source[reader.index]);
    }

    start = reader.index;
    while(reader.index < reader.length) {
      ch = source.charCodeAt(reader.index);
      // exclude backslash (\) and add hyphen (-)
      if(ch === 92 ||
         !(ch === 45 || reader.isIdentifierPart(ch))) {
        break;
      }
      value += source[reader.index++];
    }

    this.buffer.add(
      reader.makeIdentifier(value, { start: start })
    );
  },

  readPunc: function() {
    this.buffer.add(this.reader.readPunctuator());
  }
};

var XHTMLEntities = {
  quot: '\u0022',
  amp: '&',
  apos: '\u0027',
  lt: '<',
  gt: '>',
  nbsp: '\u00A0',
  iexcl: '\u00A1',
  cent: '\u00A2',
  pound: '\u00A3',
  curren: '\u00A4',
  yen: '\u00A5',
  brvbar: '\u00A6',
  sect: '\u00A7',
  uml: '\u00A8',
  copy: '\u00A9',
  ordf: '\u00AA',
  laquo: '\u00AB',
  not: '\u00AC',
  shy: '\u00AD',
  reg: '\u00AE',
  macr: '\u00AF',
  deg: '\u00B0',
  plusmn: '\u00B1',
  sup2: '\u00B2',
  sup3: '\u00B3',
  acute: '\u00B4',
  micro: '\u00B5',
  para: '\u00B6',
  middot: '\u00B7',
  cedil: '\u00B8',
  sup1: '\u00B9',
  ordm: '\u00BA',
  raquo: '\u00BB',
  frac14: '\u00BC',
  frac12: '\u00BD',
  frac34: '\u00BE',
  iquest: '\u00BF',
  Agrave: '\u00C0',
  Aacute: '\u00C1',
  Acirc: '\u00C2',
  Atilde: '\u00C3',
  Auml: '\u00C4',
  Aring: '\u00C5',
  AElig: '\u00C6',
  Ccedil: '\u00C7',
  Egrave: '\u00C8',
  Eacute: '\u00C9',
  Ecirc: '\u00CA',
  Euml: '\u00CB',
  Igrave: '\u00CC',
  Iacute: '\u00CD',
  Icirc: '\u00CE',
  Iuml: '\u00CF',
  ETH: '\u00D0',
  Ntilde: '\u00D1',
  Ograve: '\u00D2',
  Oacute: '\u00D3',
  Ocirc: '\u00D4',
  Otilde: '\u00D5',
  Ouml: '\u00D6',
  times: '\u00D7',
  Oslash: '\u00D8',
  Ugrave: '\u00D9',
  Uacute: '\u00DA',
  Ucirc: '\u00DB',
  Uuml: '\u00DC',
  Yacute: '\u00DD',
  THORN: '\u00DE',
  szlig: '\u00DF',
  agrave: '\u00E0',
  aacute: '\u00E1',
  acirc: '\u00E2',
  atilde: '\u00E3',
  auml: '\u00E4',
  aring: '\u00E5',
  aelig: '\u00E6',
  ccedil: '\u00E7',
  egrave: '\u00E8',
  eacute: '\u00E9',
  ecirc: '\u00EA',
  euml: '\u00EB',
  igrave: '\u00EC',
  iacute: '\u00ED',
  icirc: '\u00EE',
  iuml: '\u00EF',
  eth: '\u00F0',
  ntilde: '\u00F1',
  ograve: '\u00F2',
  oacute: '\u00F3',
  ocirc: '\u00F4',
  otilde: '\u00F5',
  ouml: '\u00F6',
  divide: '\u00F7',
  oslash: '\u00F8',
  ugrave: '\u00F9',
  uacute: '\u00FA',
  ucirc: '\u00FB',
  uuml: '\u00FC',
  yacute: '\u00FD',
  thorn: '\u00FE',
  yuml: '\u00FF',
  OElig: '\u0152',
  oelig: '\u0153',
  Scaron: '\u0160',
  scaron: '\u0161',
  Yuml: '\u0178',
  fnof: '\u0192',
  circ: '\u02C6',
  tilde: '\u02DC',
  Alpha: '\u0391',
  Beta: '\u0392',
  Gamma: '\u0393',
  Delta: '\u0394',
  Epsilon: '\u0395',
  Zeta: '\u0396',
  Eta: '\u0397',
  Theta: '\u0398',
  Iota: '\u0399',
  Kappa: '\u039A',
  Lambda: '\u039B',
  Mu: '\u039C',
  Nu: '\u039D',
  Xi: '\u039E',
  Omicron: '\u039F',
  Pi: '\u03A0',
  Rho: '\u03A1',
  Sigma: '\u03A3',
  Tau: '\u03A4',
  Upsilon: '\u03A5',
  Phi: '\u03A6',
  Chi: '\u03A7',
  Psi: '\u03A8',
  Omega: '\u03A9',
  alpha: '\u03B1',
  beta: '\u03B2',
  gamma: '\u03B3',
  delta: '\u03B4',
  epsilon: '\u03B5',
  zeta: '\u03B6',
  eta: '\u03B7',
  theta: '\u03B8',
  iota: '\u03B9',
  kappa: '\u03BA',
  lambda: '\u03BB',
  mu: '\u03BC',
  nu: '\u03BD',
  xi: '\u03BE',
  omicron: '\u03BF',
  pi: '\u03C0',
  rho: '\u03C1',
  sigmaf: '\u03C2',
  sigma: '\u03C3',
  tau: '\u03C4',
  upsilon: '\u03C5',
  phi: '\u03C6',
  chi: '\u03C7',
  psi: '\u03C8',
  omega: '\u03C9',
  thetasym: '\u03D1',
  upsih: '\u03D2',
  piv: '\u03D6',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  zwnj: '\u200C',
  zwj: '\u200D',
  lrm: '\u200E',
  rlm: '\u200F',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201A',
  ldquo: '\u201C',
  rdquo: '\u201D',
  bdquo: '\u201E',
  dagger: '\u2020',
  Dagger: '\u2021',
  bull: '\u2022',
  hellip: '\u2026',
  permil: '\u2030',
  prime: '\u2032',
  Prime: '\u2033',
  lsaquo: '\u2039',
  rsaquo: '\u203A',
  oline: '\u203E',
  frasl: '\u2044',
  euro: '\u20AC',
  image: '\u2111',
  weierp: '\u2118',
  real: '\u211C',
  trade: '\u2122',
  alefsym: '\u2135',
  larr: '\u2190',
  uarr: '\u2191',
  rarr: '\u2192',
  darr: '\u2193',
  harr: '\u2194',
  crarr: '\u21B5',
  lArr: '\u21D0',
  uArr: '\u21D1',
  rArr: '\u21D2',
  dArr: '\u21D3',
  hArr: '\u21D4',
  forall: '\u2200',
  part: '\u2202',
  exist: '\u2203',
  empty: '\u2205',
  nabla: '\u2207',
  isin: '\u2208',
  notin: '\u2209',
  ni: '\u220B',
  prod: '\u220F',
  sum: '\u2211',
  minus: '\u2212',
  lowast: '\u2217',
  radic: '\u221A',
  prop: '\u221D',
  infin: '\u221E',
  ang: '\u2220',
  and: '\u2227',
  or: '\u2228',
  cap: '\u2229',
  cup: '\u222A',
  'int': '\u222B',
  there4: '\u2234',
  sim: '\u223C',
  cong: '\u2245',
  asymp: '\u2248',
  ne: '\u2260',
  equiv: '\u2261',
  le: '\u2264',
  ge: '\u2265',
  sub: '\u2282',
  sup: '\u2283',
  nsub: '\u2284',
  sube: '\u2286',
  supe: '\u2287',
  oplus: '\u2295',
  otimes: '\u2297',
  perp: '\u22A5',
  sdot: '\u22C5',
  lceil: '\u2308',
  rceil: '\u2309',
  lfloor: '\u230A',
  rfloor: '\u230B',
  lang: '\u2329',
  rang: '\u232A',
  loz: '\u25CA',
  spades: '\u2660',
  clubs: '\u2663',
  hearts: '\u2665',
  diams: '\u2666'
};

var JSXTAGS = {
  a: true,
  abbr: true,
  address: true,
  applet: true,
  area: true,
  article: true,
  aside: true,
  audio: true,
  b: true,
  base: true,
  bdi: true,
  bdo: true,
  big: true,
  blockquote: true,
  body: true,
  br: true,
  button: true,
  canvas: true,
  caption: true,
  circle: true,
  cite: true,
  code: true,
  col: true,
  colgroup: true,
  command: true,
  data: true,
  datalist: true,
  dd: true,
  defs: true,
  del: true,
  details: true,
  dfn: true,
  dialog: true,
  div: true,
  dl: true,
  dt: true,
  ellipse: true,
  em: true,
  embed: true,
  fieldset: true,
  figcaption: true,
  figure: true,
  footer: true,
  form: true,
  g: true,
  h1: true,
  h2: true,
  h3: true,
  h4: true,
  h5: true,
  h6: true,
  head: true,
  header: true,
  hgroup: true,
  hr: true,
  html: true,
  i: true,
  iframe: true,
  img: true,
  input: true,
  ins: true,
  kbd: true,
  keygen: true,
  label: true,
  legend: true,
  li: true,
  line: true,
  linearGradient: true,
  link: true,
  main: true,
  map: true,
  mark: true,
  marquee: true,
  mask: false,
  menu: true,
  menuitem: true,
  meta: true,
  meter: true,
  nav: true,
  noscript: true,
  object: true,
  ol: true,
  optgroup: true,
  option: true,
  output: true,
  p: true,
  param: true,
  path: true,
  pattern: false,
  polygon: true,
  polyline: true,
  pre: true,
  progress: true,
  q: true,
  radialGradient: true,
  rect: true,
  rp: true,
  rt: true,
  ruby: true,
  s: true,
  samp: true,
  script: true,
  section: true,
  select: true,
  small: true,
  source: true,
  span: true,
  stop: true,
  strong: true,
  style: true,
  sub: true,
  summary: true,
  sup: true,
  svg: true,
  table: true,
  tbody: true,
  td: true,
  text: true,
  textarea: true,
  tfoot: true,
  th: true,
  thead: true,
  time: true,
  title: true,
  tr: true,
  track: true,
  tspan: true,
  u: true,
  ul: true,
  'var': true,
  video: true,
  wbr: true
};

module.exports = sweet.currentReadtable().extend({
  '<': function (ch, reader) {
    var reader = new JSXReader(reader);
    reader.read();
    var toks = reader.buffer.finish();
    return toks.length ? toks : null;
  }
});
