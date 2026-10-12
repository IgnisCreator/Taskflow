#!/usr/bin/env bash
# Source checks shared by CI and the Docker check. Each pattern must match nothing in src/.
set -euo pipefail
fail=0
check() { # check <reason> <pattern>
  if grep -rnE "$2" src; then
    echo "guard failed: $1"
    fail=1
  fi
}
check "test-only helpers must never reach the app" 'testUtils|tests/helpers'
check "use the design tokens, not raw Tailwind colours" '(bg|text|border|ring|outline|divide|from|to|via|fill|stroke|shadow|decoration|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]|(bg|text|border)-(white|black)\b'
exit "$fail"
