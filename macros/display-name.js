
macro syntaxString {
  case { _ $x } => {
    var stx = #{$x};
    return [makeValue(unwrapSyntax(stx), #{_})];
  }
}

let var = macro {
  rule { $id:ident = React.createClass({ $prop ... }) } => {
    var $id = React.createClass({
      displayName: syntaxString $id,
      $prop ...
    })
  }

  rule {} => { var }
}
export var;

let (React.createClass) = macro {
  rule infix { $obj.$name = | ({ $prop ... }) } => {
    $obj.$name = React.createClass({
      displayName: syntaxString $name,
      $prop ...
    })
  }

  rule infix { $name = | ({ $prop ... }) } => {
    $name = React.createClass({
      displayName: syntaxString $name,
      $prop ...
    })
  }

  rule infix { $name : | ({ $prop ... }) } => {
    $name: React.createClass({
      displayName: syntaxString $name,
      $prop ...
    })
  }

  rule {} => { React.createClass }
}
export (React.createClass);
