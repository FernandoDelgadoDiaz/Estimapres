#!/usr/bin/env bash
# Prueba la migración AH2-042 sobre un Postgres local efímero (no toca Supabase). Requiere binarios de PostgreSQL ≥ 15
# con btree_gist. Uso: scripts/db/probar-configuracion-motor.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d)"; PUERTO="${PG_PUERTO:-55432}"
# El servidor no puede correr como root: en ese caso se usa el usuario del sistema «postgres».
COMO=(); if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; COMO=(runuser -u postgres --); fi
trap '"${COMO[@]}" "$BIN/pg_ctl" -D "$DIR/datos" -m immediate stop >/dev/null 2>&1 || true; rm -rf -- "$DIR"' EXIT
"${COMO[@]}" "$BIN/initdb" -D "$DIR/datos" -U postgres -A trust >/dev/null
"${COMO[@]}" "$BIN/pg_ctl" -D "$DIR/datos" -o "-p $PUERTO -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
P=(psql -h "$DIR" -p "$PUERTO" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -f "$RAIZ/supabase/tests/_auth_stub.sql"
"${P[@]}" -f "$RAIZ/supabase/migrations/20261121120000_configuracion_motor_sucursal.sql"
"${P[@]}" -f "$RAIZ/supabase/tests/configuracion_motor_sucursal.test.sql" | grep -q PRUEBAS_SQL_OK
echo "SQL: integridad, aislamiento, atomicidad e historial OK"

# Concurrencia real: dos sesiones reemplazan la misma regla con la misma versión. La primera bloquea la fila y
# confirma; la segunda espera el bloqueo y termina con CONFLICTO_CONCURRENTE sin cambios.
CLAIMS="select set_config('request.jwt.claims','{\"sub\":\"44444444-4444-4444-4444-444444444444\",\"is_anonymous\":false}',false); set role authenticated;"
ID=$("${P[@]}" -At -c "$CLAIMS select (public.cms_crear('{\"sucursal_id\":\"C\",\"clase\":\"permanente\",\"tipo\":\"topes_caja_eventual_contrato\",\"vigencia_desde\":\"2026-11-23\",\"datos\":{\"FULL\":{\"activo\":true,\"horas\":12},\"PART\":{\"activo\":true,\"horas\":8}}}')).id;" | tail -1)
NUEVA='{"sucursal_id":"C","clase":"permanente","tipo":"topes_caja_eventual_contrato","vigencia_desde":"2026-12-07","datos":{"FULL":{"activo":true,"horas":10},"PART":{"activo":true,"horas":6}}}'
( "${P[@]}" -c "$CLAIMS begin; select public.cms_reemplazar('$ID',1,'$NUEVA'); select pg_sleep(2); commit;" >"$DIR/a.out" 2>&1 ) &
sleep 0.7
if "${P[@]}" -c "$CLAIMS select public.cms_reemplazar('$ID',1,'$NUEVA');" >"$DIR/b.out" 2>&1; then echo "FALLA: la segunda sesión no detectó el conflicto"; exit 1; fi
wait
grep -q CONFLICTO_CONCURRENTE "$DIR/b.out" || { cat "$DIR/b.out"; exit 1; }
N=$("${P[@]}" -At -c "$CLAIMS select count(*) from public.configuracion_motor_sucursal where sucursal_id='C';" | tail -1)
[ "$N" = "2" ] || { echo "FALLA: se esperaban 2 versiones y hay $N"; exit 1; }
echo "Concurrencia: segunda sesión rechazada con CONFLICTO_CONCURRENTE; una sola versión nueva"
