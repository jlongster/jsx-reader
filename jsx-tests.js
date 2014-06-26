var fs = require('fs');
var sweet = require('sweet.js');
var jsxmacro = sweet.loadNodeModule(process.cwd(), './jsx-macro.js');
sweet.setReadtable('./index.js');

var tests = [
  '<a />',
  '<a v />',
  '<a foo="bar"> {value} <b><c /></b></a>',
  '<a b={" "} c=" " d="&amp;" />',
  '<a\n/>',
  '<AbC-def\n  test="&#x0026;&#38;">\nbar\nbaz\n</AbC-def>',
  '<a b={x ? <c /> : <d />} />',
  '<a>{}</a>',
  '<div>@test content</div>',
  '<div><br />7x invalid-js-identifier</div>',
  '<a.b></a.b>',
  '<a.b.c></a.b.c>',
  '(<div />) < x'
];

var results = [
  'React.DOM.a(null)',
  'React.DOM.a({ v: true })',
  "React.DOM.a({ foo: 'bar' }, ' ', value, ' ', React.DOM.b(null, c(null)))",
  "React.DOM.a({ b: ' ', c: ' ', d: '&'})",
  'React.DOM.a(null)',
  "AbC-def({\n  test: '&&' }, \n'bar' + ' ' +\n 'baz'\n)",
  'React.DOM.a({ b: x ? c(null) : d(null) })',
  'React.DOM.a(null)',
  "React.DOM.div(null, '@test content')",
  "React.DOM.div(null, React.DOM.br(null), '7x invalid-js-identifier')",
  'a.b(null)',
  'a.b.c(null)',
  'React.DOM.div(null) < x'
];

tests.forEach(function(test, i) {
  var code = sweet.compile(test, {
    modules: jsxmacro
  }).code;

  code = code.trim()
    .replace(/;$/, '')
    .replace(/\n/g, '')
    .replace(/ +/g, ' ');
  var result = results[i]
        .replace(/\n/g, '')
        .replace(/ +/g, ' ');

  if(code !== result) {
    throw new Error('Failed: expected ' + result +
                    ' but got ' + code);
  }
});

console.log('passed');
