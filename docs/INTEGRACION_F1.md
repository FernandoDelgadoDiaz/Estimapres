# AH2 — Plan de integración de F1 por lotes

**Estado:** PROPUESTO por Claude (2026-11-12). **Ningún merge está autorizado**: cada lote requiere autorización explícita del propietario (AGENTS.md).
**Base verificada:** `main` = `9909e87`. **Ensayo real:** todos los PR combinados en la rama `integracion/ah2-f1-demo` (PR #24, ⛔ no integrar): `npm ci` ✅, **168 tests OK + 1 omitido**, `tsc` ✅, build ✅, recorrido POM → cronograma → validación → PDF verificado con Playwright.

## 1. Efecto de un merge en producción

Todo merge a `main` dispara **despliegue de producción en dos sitios Netlify** que construyen este mismo repositorio (verificado vía API de Netlify, lectura): `al-iada` (`al-iada.netlify.app`) y `prestify` (`prestify.netlify.app`). Ambos publican la misma app y las mismas funciones (`claude-proxy`, `create-payment`, `webhook-mp`). Cualquier efecto descrito abajo aplica **a los dos**. Si `prestify` no debe seguir publicando Aliada Horarios, es una decisión del propietario (desvincular el sitio en Netlify) independiente de estos PR.

## 2. Inventario de PR (todos draft, base `main` salvo apilados)

| PR | Issue | Rama / HEAD | Depende de | Cambia horarios generados | Tests en su rama | Conflictos al integrar |
|---|---|---|---|---|---|---|
| #16 | #6 lockfile + CI | `feat/ah2-tool01-ci` `7d3a980` | — | No | 80/80 · **CI verde en GitHub** | — |
| #15 | #4 SEC-01 | `fix/ah2-sec01-disable-claude-proxy` `20ba3d5` | — | No (solo desaparece la alerta opcional «💡») | 99/99 | `CURRENT_WORK.md` |
| #17 | #8 POM-01 | `feat/ah2-pom01-contrato` `722409c` | — | No (cambia la semana usada: la del POM) | 100 + 1 omitido | `CURRENT_WORK.md`; `NuevaSemanaPage.tsx` con #21 |
| #18 | #9 ID-01 | `feat/ah2-id01-ids-estables` `1350d8a` | — | No (salida idéntica a `main`; solo con homónimos) | 87/87 | `CURRENT_WORK.md` |
| #19 | #10 VAL-01 | `feat/ah2-val01-validador` `ca0112e` | — | No (agrega validador, no conectado) | 96/96 | `CURRENT_WORK.md` |
| #20 | #10 motor 12 h | `fix/ah2-descanso-12h` `18e7eef` | **#19** (apilado) | **Sí**: elimina descansos de 11,5 h; misma cobertura en el fixture | 98/98 | `CURRENT_WORK.md` |
| #21 | #12 parcial | `feat/ah2-pub01-validacion-pdf` `574389d` | **#20** (apilado) | No (UI y PDF) | 104/104 | `NuevaSemanaPage.tsx` con #17; `CURRENT_WORK.md` |
| #22 | #11 RULES-01 | `feat/ah2-rules01-reglas-v2` `79c94c1` | — (formalmente #7/#9, ver PR) | No (módulo no conectado) | 98/98 | `CURRENT_WORK.md` |

**Resolución de conflictos (verificada en el ensayo):**
- `docs/CURRENT_WORK.md`: cada rama agrega su sección al inicio → conservar **todas** (unión). Tras el último lote, reemplazar por el estado vigente consolidado.
- `src/pages/NuevaSemanaPage.tsx` (#17 ↔ #21): ambos agregan `useState` en el mismo lugar → conservar **ambos bloques**; el resto se combina solo. Resultado: las fechas del POM (#17) alimentan el contexto de validación (#21). Compila y pasa toda la suite.

## 3. Lotes propuestos

### Lote 0 — acciones del propietario (sin merge) — **antes de todo**
1. Revocar/rotar la clave de Anthropic usada por Netlify (o confirmar que no existe). Es lo único que cierra el relé en deploys antiguos (`docs/SEC01_REMEDIATION_RUNBOOK.md` en #15).
2. Quitar `CLAUDE_API_KEY` (y cualquier `VITE_*` de Anthropic) en **ambos** sitios.

### Lote 1 — seguridad y herramientas (riesgo bajo, sin cambio de horarios)
Orden: **#16 → #15**.
- #16 primero: a partir de ahí CI corre en cada PR. Después, actualizar cada PR abierto con `main` («Update branch») para que CI los valide.
- Verificación post-deploy: `scripts/sec01-verify-proxy.sh https://al-iada.netlify.app https://prestify.netlify.app` → `SEGURO OPTIONS=204 … GET=405`; tras el lote 0, también con `--post` → `POST=503`.
- Rollback: revertir el merge (la app vuelve a mostrar sugerencias IA, que con la clave revocada fallan en silencio).

### Lote 2 — entrada POM e identidad (sin cambio de horarios para rosters normales)
Orden: **#17 → #18**.
- **Antes de #17:** validar el PDF POM real **localmente** (`POM_PDF=… npx vitest run pom-real.local`, solo imprime números). #17 vuelve **errores explícitos** situaciones que antes se corregían en silencio (negativos, duplicados, huecos); si el PDF real tiene alguna, hay que verlo antes de producción.
- Verificación post-deploy: subir un POM → la pantalla «Revisar» muestra la semana del documento.
- Rollback: revertir; no hay datos migrados.

### Lote 3 — validación, corrección del motor y PDF
Orden: **#19 → #20 → #21**.
- Al integrar #19, GitHub reapunta #20 a `main` solo si se borra la rama de #19 al mergear; si no, cambiar la base de #20 a `main` manualmente (ídem #21 tras #20).
- #20 **cambia los horarios generados** (12 h reales). Recomendado: generar la misma semana antes/después en el preview y revisar.
- #21 tendrá el conflicto con #17 descrito arriba.
- Verificación: generar → estado «VALIDADO/BORRADOR»; exportar PDF → encabezado con sucursal y fechas, anexo «Validación y faltantes».

### Lote 4 — reglas v2 (sin efecto visible)
**#22**. Puede ir en cualquier momento; el módulo no está conectado a la UI.

## 4. Pendientes que NO cubre ningún lote
- Migraciones (no autorizadas): estados de publicación (#12), reglas v2 (#22, `docs/proposals/RULES01_reglas_v2.sql`), ids en reglas/correcciones (#18, `docs/proposals/ID01_colaborador_id.sql`).
- Decisiones: D1–D3 (#7), D4 (cierre 22:30/23:00), D5 (#5), datos personales en el repo (#23).
- Lint: el repo no tiene configuración ESLint (`npm run lint` falla en `main`).
