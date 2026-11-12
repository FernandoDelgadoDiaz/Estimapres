#!/usr/bin/env bash
# SEC-01 (#4) — Verificación del endpoint claude-proxy en sitios Netlify.
#
# Uso:
#   scripts/sec01-verify-proxy.sh [--post] URL_BASE [URL_BASE ...]
#   ej.: scripts/sec01-verify-proxy.sh https://al-iada.netlify.app https://prestify.netlify.app
#
# Por defecto envía SOLO OPTIONS y GET: en el código vulnerable esos métodos no
# llaman a Anthropic, por lo que la verificación no usa ni gasta la clave.
# --post agrega un POST: úselo ÚNICAMENTE después de revocar la clave en
# Anthropic o contra URLs que ya tengan la mitigación, porque en una versión
# vulnerable con clave válida el POST se reenviaría a Anthropic.
#
# Resultado por URL: SEGURO (OPTIONS sin "Access-Control-Allow-Origin: *",
# GET 405, POST 503 si se pidió) o VULNERABLE. Código de salida 1 si alguna
# URL es VULNERABLE.
set -u
POST=0
if [ "${1:-}" = "--post" ]; then POST=1; shift; fi
[ $# -ge 1 ] || { sed -n '2,16p' "$0"; exit 2; }

fallos=0
for base in "$@"; do
  url="${base%/}/.netlify/functions/claude-proxy"
  h=$(mktemp)
  opt=$(curl -s -o /dev/null -D "$h" -w '%{http_code}' -X OPTIONS -H 'Origin: https://example.invalid' "$url")
  acao=$(grep -i '^access-control-allow-origin:' "$h" | tr -d '\r' | cut -d' ' -f2-)
  get=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  post="-"
  if [ $POST -eq 1 ]; then
    post=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "$url")
  fi
  rm -f "$h"
  estado=SEGURO
  if [ "$acao" = "*" ] || [ "$opt" = "200" ]; then estado=VULNERABLE; fi
  if [ $POST -eq 1 ] && [ "$post" != "503" ] && [ "$post" != "404" ]; then estado=VULNERABLE; fi
  [ "$estado" = VULNERABLE ] && fallos=$((fallos+1))
  printf '%-10s OPTIONS=%s ACAO=%s GET=%s POST=%s  %s\n' "$estado" "$opt" "${acao:-none}" "$get" "$post" "$base"
done
exit $(( fallos > 0 ))
