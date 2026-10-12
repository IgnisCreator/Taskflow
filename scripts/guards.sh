#!/usr/bin/env bash
# Source checks shared by CI and the Docker check. Each grep must find nothing.
set -euo pipefail
# Test-only helpers must never reach the app.
! grep -rnE 'testUtils|tests/helpers' src
# Only design tokens, never raw Tailwind colours.
! grep -rnE '(bg|text|border|ring|outline|divide|from|to|via|fill|stroke|shadow|decoration|accent|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]|(bg|text|border)-(white|black)\b' src
