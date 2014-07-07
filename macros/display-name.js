
macro _appendDisplayName {
  case { _ $ctx $id ($names ...) ($values:expr (,) ...) } => {
    var names = #{$names ...};
    var values = #{$values ...};

    var skip = names.filter(function(stx) {
      return stx.token.value === 'displayName';
    }).length;

    if(!skip) {
      names.unshift(makeIdent('displayName', #{$ctx}));
      values.unshift(makeValue(unwrapSyntax(#{$id}), #{$ctx}));
    }

    // Keep the same hygienge
    letstx $react = [makeIdent('React', #{$ctx})],
    $names ... = names,
    $values ... = values;
    
    return #{
      $react.createClass({
        $($names:$values) (,) ...
      })
    };
  }
}

let var = macro {
  case {
    $_ $id:ident = React.createClass({
      $($pname $[:] $pvalue:expr) (,) ...
    })
  } => {
    return #{
      var $id = _appendDisplayName $_ $id ($pname ...) ($pvalue (,) ...)
    };    
  }

  case { $_ } => { return #{var}; }
}
export var;

let createClass = macro {
  case infix {
    $obj.$name = React. | $_ ({ $($pname $[:] $pvalue:expr) (,) ... })
  } => {
    return #{
      $obj.$name = _appendDisplayName $_ $name ($pname ...) ($pvalue (,) ...)
    };
  }

  case infix {
    $name = React. | $_ ({ $($pname $[:] $pvalue:expr) (,) ... })
  } => {
    return #{
      $name = _appendDisplayName $_ $name ($pname ...) ($pvalue (,) ...)
    };
  }

  case infix {
    $name $[:] React. | $_ ({ $($pname $[:] $pvalue:expr) (,) ... })
  } => {
    return #{
      $name: _appendDisplayName $_ $name ($pname ...) ($pvalue (,) ...)
    };
  }

  //case { $_ } => { return #{createClass}; }
}
export createClass;
