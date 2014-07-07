
let DOM = macro {
    rule { { $a . $b $expr ... } } => {
        DOM_member { $a . $b $expr ... }
    }
    
    rule { { $el $attrs } } => {
        $el($attrs)
    }

    rule { { $elStart $attrs $children:expr ... } } => {
        $elStart($attrs, $children (,) ...)
    }
    
    rule { } => { DOM }
}

macro DOM_member {
    rule { { $a . $b $expr ... } } => {
        DOM_member { ($a . $b) $expr ... }
    }

    rule { { $expr ... } } => {
        DOM { $expr ... }
    }
}

export DOM
