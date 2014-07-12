require('colors');
var fs = require('fs');
var jsdiff = require('diff');
var sweet = require('sweet.js');
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
  '(<div />) < x',
  'var App = React.createClass({\n  render: function() {\n    return <div />\n  }\n});'
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
  'React.DOM.div(null) < x',
  'var App$1223 = React.createClass({ displayName: \'App\', render: function () { return React.DOM.div(null); } })'
];

function writeDiff(actual, expected) {
  var diff = jsdiff.diffChars(actual, expected);

  diff.forEach(function(part){
    var color = part.added || part.removed ? 'red' : 'grey';
    process.stderr.write(part.value[color]);
  });

  // add new line
  console.error();
}

tests.forEach(function(test, i) {
  var code = sweet.compile(test).code;

  code = code.trim()
    .replace(/;$/, '')
    .replace(/\n/g, '')
    .replace(/ +/g, ' ');
  var result = results[i]
        .replace(/\n/g, '')
        .replace(/ +/g, ' ');

  if(code !== result) {
    console.error('Test %d failed:', i + 1);
    writeDiff(code, result);
    process.exit(1);
  }
});

console.log('passed');
