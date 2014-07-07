
let _DOM = macro {
  rule { { $a . $b $expr ... } } => {
    _DOM_member { $a . $b $expr ... }
  }
  
  rule { { $el $attrs } } => {
    $el($attrs)
  }

  rule { { $el $attrs , } } => {
    $el($attrs)
  }

  rule { { $elStart $attrs $($children:expr,) ... } } => {
    $elStart($attrs, $children (,) ...)
  }
  
  rule { } => { _DOM }
}

macro _DOM_member {
  rule { { $a . $b $expr ... } } => {
    _DOM_member { ($a . $b) $expr ... }
  }

  rule { { $expr ... } } => {
    _DOM { $expr ... }
  }
}

export _DOM
