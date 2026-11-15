#!/bin/bash
# Esegue tutti i test con il motore JavaScript già presente nel Mac (nessuna installazione).
cd "$(dirname "$0")" || exit 1
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
OUT=$("$JSC" -m jsc.js 2>&1)
echo "$OUT"
echo "$OUT" | grep -q " 0 falliti" || exit 1
