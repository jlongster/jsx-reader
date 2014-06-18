
# jsx-reader

A reader to hook in JSX syntax to JavaScript, using
[sweet.js](http://sweetjs.org/). Why? Because now you can use any
other language extensions (macros) with JSX. All you have to do is
integrate sweet.js in your pipeline and you can have everything,
including *working* sourcemaps and nice errors across all things.

We need to stop building individual compilers, and macros are the way
to go for composable language extensions. You can try to pass ASTs
between compilers, but it just doesn't work (can't actually extend the
syntax, and features will quickly collide).

This depends on a version of sweet.js with readtables, which hasn't
been merged into master yet, but [will be
soon](https://github.com/mozilla/sweet.js/pull/340). Don't use this
just yet, but all will be well soon enough.

More to come.

Much to see.

Wow.

```
<div>
  Monkeys:
  {listOfMonkeys} {scratchesAss}
</div>
```

```
React.DOM.div(null, 'Monkeys:', listOfMonkeys, ' ', scratchesAss);
```

Or

```
<div>
    <h1>Title</h1>
    <p>
</div>
```

```
SyntaxError: [JSX] Expected correspoding closing tag for p
5: </div>
     ^
    at Object.readtables.parserAccessor.throwSyntaxError (/Users/james/projects/jsx-
reader/node_modules/sweet.js/lib/parser.js:4947:23)                                
    at Object.JSXReader.readElement (/Users/james/projects/jsx-reader/jsx-reader.js:
223:21)                                                                            
```