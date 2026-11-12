# CURRENT WORK — ALIADA HORARIOS 2.0

## ▶ PUNTO ÚNICO DE RETOMA (vigente) — rama de release `release/ah2-f1` — Claude, 2026-11-12

**Leer primero esto.** Esta sección manda sobre las demás. El detalle de cada tarea está en «Registro por tarea», más abajo.

- **`main`:** `9909e87`. **Nada de F1 está integrado ni desplegado.**
- **Rama de release `release/ah2-f1`:** combina, sobre `main` y en este orden: #16 → #15 → #26 → #27 → #25 → #17 → #18 → #19 → #20 → #21 → #22 → #29. Conflictos resueltos:
  - `docs/CURRENT_WORK.md`: reordenado en este archivo;
  - `src/pages/NuevaSemanaPage.tsx` entre #17 y #21: se conservan los dos bloques de estado;
  - registro AH2 del MASTER: reordenado.
  
  Evidencia de pruebas: en el PR de la rama de release y en la épica #3.
- **#24** es solo demostración (*deploy preview*). **No es PR de integración.**
- **Cómo integrar** (requiere autorización del propietario; cada merge despliega `al-iada` y `prestify`):
  - **opción A:** PR por PR en el orden de arriba (`docs/INTEGRACION_F1.md`);
  - **opción B:** un único merge de la rama de release, que ya está probada en conjunto.
- **Antes de integrar (lote 0):** revocar la clave de Anthropic. Ver `docs/SEC01_REMEDIATION_RUNBOOK.md`.
- **Bloqueos del propietario:**
  - D1–D3 (#7) y D4 (cierre);
  - D5 (#5);
  - historial y visibilidad del repo por datos personales (#23);
  - AUX-D1 a AUX-D4 (#28);
  - migraciones propuestas (#12, #18, #22, #28).
- **Siguiente acción exacta para cualquier modelo:**
  1. Si se autorizó la integración: seguir A o B, verificar con `scripts/sec01-verify-proxy.sh` y `curl …/nueva-semana` = 200, y actualizar esta sección en `main`.
  2. Si no: trabajo desbloqueado sin decisiones → UI de excepciones de disponibilidad y aviso de huecos de supervisión (#28), prueba de PDF con roster grande (#12). No hacer merge, deploy, migraciones ni cambios de credenciales.

## Registro por tarea (cada rama de F1)

### ESTADO — TOOL-01 (#6) — rama `feat/ah2-tool01-ci` — Claude, 2026-11-12

- **Issue:** [#6](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/6) · **PR:** draft (ver Issue #6) · base `main` `9909e87`.
- **Cambios:** `package-lock.json` regenerado con `npm install --package-lock-only` (solo **agrega** las entradas faltantes `esbuild@0.28.2` y binarios `@esbuild/*` anidados bajo `vitest`; ninguna versión existente cambia); `.github/workflows/ci.yml` (Node 22: `npm ci` → `npm test` → `npm run build`, en PR y push a `main`, permisos `contents: read`).
- **Pruebas locales:** `rm -rf node_modules && npm ci` ✅ (344 paquetes) · `npm test` ✅ 80/80 · `npm run build` (tsc + vite) ✅. La ejecución en GitHub Actions se ve en el PR.
- **Fuera de alcance / deuda:** `npm run lint` falla porque el repo no tiene configuración ESLint (no se agrega aquí). `@anthropic-ai/sdk` se podrá quitar de `package.json` recién cuando PR #15 esté en `main` (hoy `main` todavía lo importa).
- **Conflictos esperables:** cada rama de tarea agrega su sección al inicio de este archivo; al integrar, conservar todas las secciones.
- **Siguiente:** revisión del propietario; merge despliega producción (ambos sitios Netlify) → requiere autorización. Continuar con #8 / #9.
### ESTADO — SEC-01 (#4) — rama `fix/ah2-sec01-disable-claude-proxy` — Astra + Claude, 2026-11-12

- **Trabajo actual:** Issue [#4](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/4) — mitigación temporal *fail closed* del proxy Anthropic (P0). PR [#15](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/15) **DRAFT**, base `main` `9909e87d8dd6215351a20d6907b4f40a0be75b77`.
- **Rama:** `fix/ah2-sec01-disable-claude-proxy`. Commits: Astra `2bccb5a`…`74b3631` (mitigación + docs); Claude `569fe11e231ab1515ad3f19c07e5f79ca1d79055` (pruebas y endurecimiento) + commit documental que contiene este archivo (SHA final: comentario de Claude en PR #15 o `git log -1 origin/fix/ah2-sec01-disable-claude-proxy`).
- **Archivos del PR (vs `main`):** `netlify/functions/claude-proxy.ts`, `src/utils/iaAsignacion.ts`, `src/hooks/useAsignacion.ts`, `.env.example`, `src/utils/__tests__/claude-proxy-disabled.test.ts`, `src/utils/__tests__/sec01-generacion-sin-ia.test.ts`, `docs/ALIADA_HORARIOS_MASTER.md`, `docs/CURRENT_WORK.md`.
- **Qué hace la mitigación:** el proxy responde POST→503, otros métodos→405, OPTIONS→204 sin CORS; no lee `CLAUDE_API_KEY` ni hace `fetch`. El cliente ya no importa el SDK, no lee `VITE_*` de Anthropic ni llama al proxy. El motor determinístico no cambia.
- **Pruebas ejecutadas por Claude (2026-11-12, entorno con dependencias):**
  - `npm ci` → **FALLA** (lockfile desincronizado, Issue #6; no se tocó). Se usó `npm install --no-save` (341 paquetes; sin cambios en `package*.json`).
  - `npx vitest run` → **99/99 OK** (8 archivos; 80 previos + 3 de Astra + 16 nuevos).
  - `npx tsc --noEmit` (src) → OK; `tsc --strict` del proxy → OK; `npm run build` → OK. El bundle `dist/` no contiene SDK, `api.anthropic.com`, `dangerouslyAllowBrowser`, `claude-proxy` ni la palabra Anthropic.
  - Prueba de mutación: restaurando proxy/cliente/`.env.example` de `main`, **11 tests SEC-01 fallan** → las pruebas detectan la versión vulnerable.
  - Regresión del generador: salida de `asignarHorariosConIA` con el fixture de roster real (`fixtures.ts`) **byte a byte idéntica** entre `main` y la rama (18 869 bytes; 9 horarios, 189 alertas). Única diferencia esperada en producción: desaparece la alerta opcional «💡» de Claude.
  - HTTP real contra deploy preview #15 (`al-iada` y `prestify`): POST maliciosa→503, GET→405, OPTIONS→204 sin `Access-Control-Allow-Origin`.
  - `npm run lint` → falla por **falta de configuración ESLint en el repo** (preexistente en `main`, fuera de alcance).
- **Riesgo vigente en producción (verificado 2026-11-12, solo GET/OPTIONS para no usar la clave):** `al-iada.netlify.app` y `prestify.netlify.app` (y el preview viejo `deploy-preview-2--*`) sirven la **versión vulnerable**: OPTIONS→200 con `Access-Control-Allow-Origin: *`. No se verificó si `CLAUDE_API_KEY` está cargada (requeriría un POST que usa la clave). Los *deploy permalinks* y previews anteriores de Netlify conservan su propio código de funciones, por lo que **desplegar este PR no cierra esas URLs antiguas**: el cierre efectivo requiere **revocar/rotar la clave en la consola de Anthropic** (acción del propietario) además del deploy autorizado.
- **Base y despliegue:** Supabase NO consultado ni modificado. SQL NO. Netlify: NO deploy, NO variables tocadas. Merge NO. Gastos NO.
- **Remediación preparada (no ejecutada):** [`docs/SEC01_REMEDIATION_RUNBOOK.md`](SEC01_REMEDIATION_RUNBOOK.md) + `scripts/sec01-verify-proxy.sh` (solo OPTIONS/GET por defecto; no usa la clave). Confirmado vía Netlify API (lectura): todo merge a `main` despliega **ambos** sitios (`al-iada`, `prestify`); el deploy de producción actual (`6af5ff7184f60b0849ef3c79`, commit `9909e87`) y su *permalink* sirven el relé vulnerable.
- **Fuera de alcance, registrado:** `@anthropic-ai/sdk` sigue en `package.json` sin uso (quitarlo toca el lockfile → Issue #6); `AGENTS.md` en `main` conserva la nota «en esta rama el contrato es un PR propuesto», ya obsoleta tras el merge de PR #2.
- **Siguiente acción precisa:** propietario: (1) revocar la clave Anthropic usada por Netlify (o confirmar que no existe); (2) revisar PR #15 y autorizar merge + deploy de producción en **ambos** sitios; (3) tras el deploy, verificar `OPTIONS`/`POST` en producción (esperado 204/503 sin CORS). Issue #4 queda abierta para la solución definitiva autenticada (F3/#14). Después: #6.

### ESTADO — Fallback SPA en Netlify — rama `fix/ah2-spa-fallback` — Claude, 2026-11-12

- **Defecto (verificado en producción, solo GET):** `al-iada.netlify.app/nueva-semana` y `/colaboradores` → **404** (igual en `prestify`); solo `/` responde 200. La app usa `BrowserRouter` y `netlify.toml` no tenía regla de fallback.
- **Cambio:** `netlify.toml` agrega `[[redirects]] from="/*" to="/index.html" status=200` (sin `force`).
- **Verificación:** en el deploy preview de este PR (ver comentario del PR): rutas profundas 200 y `/.netlify/functions/claude-proxy` sin cambios.
### ESTADO — PII-01 (#23) — rama `fix/ah2-pii01-datos-sinteticos` — Claude, 2026-11-12

- **Cambios:** 16 nombres de personas que parecían reales → nombres sintéticos por rol (`Full A–D`, `Part A–G`, `Aux A–D`, `Eventual A`), en roster semilla (`src/types/index.ts`), fixtures y tests, comentarios del adapter, placeholder del formulario y ejemplos del MASTER/plan. El orden alfabético dentro de cada rol se preservó a propósito: las pasadas 2/3 desempatan por id, así el motor produce exactamente lo mismo.
- **Pruebas:** `npm test` 80/80 · `tsc` ✅ · build ✅. Salida completa del motor sobre el fixture (`ejecutarAlgoritmo` + `convertirOutputDeV2`) **idéntica** a `main` tras aplicar el mapeo de nombres (solo difiere la marca de tiempo de ejecución). `git grep` de los 16 nombres, apellidos y variantes: sin resultados.
- **No hecho (requiere autorización):** reescritura del historial, cambio de visibilidad, datos de Supabase (el roster real vive allí y no se tocó). Riesgo residual evaluado en Issue #23.
### ESTADO — POM-01 (#8) — rama `feat/ah2-pom01-contrato` — Claude, 2026-11-12

- **Issue:** [#8](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/8) · **PR:** draft (ver Issue #8) · base `main` `9909e87` (independiente de #15/#16).
- **Cambios:** `src/utils/pomContrato.ts` (nuevo, puro): `detectarSemanaPOM` (lunes+domingo de la misma semana en el texto, si no en el nombre del archivo; ambigua → error), `parsearTablaEstimado` (errores explícitos: duplicados, negativos/no enteros, huecos, desorden, demanda > 0 fuera de 07:00–22:00; avisos: filas de borde ausentes). `pdfParser.ts` delega en él (`extraerTextoPDF` + `interpretarTextoPOM`). `NuevaSemanaPage.tsx` usa la semana del PDF (ya no `startOfWeek(new Date())`); si no se detecta, propone la actual y exige confirmar un lunes. `PDFUploader` muestra errores multilínea.
- **Fixture sintético** `src/utils/__tests__/fixtures/pomSintetico.ts`: 31×7, ceros 07:00/07:30, sáb 19:30–21:00 = 7, **406 horas-caja**; sin datos reales.
- **Pruebas:** `npm test` → 100 OK + 1 omitido (prueba local de PDF real, requiere `POM_PDF`); nuevos 21 (19 contrato + ida y vuelta jsPDF→pdf.js→contrato + local). `tsc` OK, `npm run build` OK. UI con Playwright sobre `vite`: PDF sintético → «Semana: 2026-11-16 al 2026-11-22 (detectada en el PDF)»; martes rechazado; cambio manual a 23/11 aplicado.
- **No verificado:** maquetación del PDF POM **real** (no está en el repo). Para validarlo localmente sin subirlo: `POM_PDF=/ruta/al.pdf npx vitest run pom-real.local` (imprime solo números).
- **Decisión D4 (cierre 22:30 vs 23:00):** no se decidió. Se mantiene MASTER §2: fila 22:00 = 22:00–22:30; slot de motor 22:30–23:00 queda sin demanda; demanda > 0 en una fila 22:30 del PDF es error explícito.
- **Siguiente:** #9 (IDs estables).
### ESTADO — ID-01 (#9) — rama `feat/ah2-id01-ids-estables` — Claude, 2026-11-12

- **Issue:** [#9](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/9) · **PR:** draft (ver Issue #9) · base `main` `9909e87`.
- **Cambios (`src/algoritmo/adapter.ts`):** `asignarIdentidadesV2` asigna ids internos del motor sin colisiones; la salida se mapea por **identidad** (id de UI) y no por nombre. Con nombre único se conserva `normalizarId(nombre)` → el desempate de pasadas 2/3 y los resultados no cambian. Homónimos («José Pérez»/«Jose Perez») → `nombre__<idUI>` + alerta visible. Id de UI repetido o vacío → error explícito. Las alertas de reglas muestran el nombre en vez del id interno.
- **Pruebas:** `npm test` 87/87 (7 nuevos en `identidades.test.ts`) · `tsc` ✅ · build ✅. Regresión: salida de `asignarHorariosConIA` con el roster real del fixture **idéntica** a `main` (todos los campos, incluidas alertas).
- **Límite:** reglas, correcciones y aprendizajes se guardan en Supabase por `colaborador_nombre`; que un renombre conserve ese aprendizaje requiere migración. SQL **propuesto, no aplicado**: `docs/proposals/ID01_colaborador_id.sql` (columna opcional `colaborador_id`, backfill solo para nombres únicos, rollback). Requiere autorización.
- **Siguiente:** #10 validador independiente (parametrizado con el perfil histórico, sin decidir D1–D3).
### ESTADO — PUB-01 parcial (#12, sin migración) — rama `feat/ah2-pub01-validacion-pdf` (apilada sobre `fix/ah2-descanso-12h`) — Claude, 2026-11-12

- **Alcance:** la parte de #12 que no requiere base de datos. Estados formales BORRADOR→PUBLICADO y bloqueo de publicación quedan pendientes de migración autorizada.
- **Cambios:** `src/utils/validacionSemana.ts` (valida el resultado con el validador independiente usando roster, excepciones, tope de francos, mínimos y la semana anterior del historial); `NuevaSemanaPage.tsx` muestra el estado «VALIDADO / BORRADOR: N violaciones» con métricas de faltantes/sobrantes y se **recalcula tras cada edición manual**; `exportPDF.ts` agrega (opcional, compatible) sucursal, fechas lunes–domingo, estado y un anexo «Validación y faltantes».
- **Pruebas:** `npm test` 104/104 (6 nuevos, incluido PDF reabierto con pdf.js que conserva sucursal, fechas, estado, nombres y anexo) · `tsc` ✅ · build ✅. **UI de punta a punta con Playwright** (vite local, roster local): subir PDF → generar → «✅ VALIDADO… Horas-caja faltantes 26.5 · sobrantes 1.5» → PDF descargado y releído con encabezado y anexo correctos.
- **Integración:** al combinar con #17 (POM-01) habrá conflicto en `NuevaSemanaPage.tsx` (`handleGenerarHorarios`): conservar las fechas de la semana del POM de #17 y el contexto de validación de este PR.
- **Hallazgo (PII):** `src/types/index.ts` (roster semilla) y `src/algoritmo/__tests__/fixtures.ts` contienen nombres y horarios que parecen de personas reales, en un repositorio **público**. Decisión del propietario: anonimizar y, si corresponde, reescribir historial.

### ESTADO — Corrección descanso 12 h (#10) — rama `fix/ah2-descanso-12h` (apilada sobre `feat/ah2-val01-validador`) — Claude, 2026-11-12

- **Defecto:** el motor contaba 19 slots de 30 min entre 23:00 y 08:00 (son 18) → aceptaba **11,5 h** de descanso. Origen: un test y comentarios asumían «slot 30 = 22:30», pero el propio motor/adapter usa slot 0 = 08:00 → slot 30 = 23:00 (lo que ve el supervisor).
- **Cambios:** `pasada1-fullpart.ts` (`bucketFin` y 8 buckets de fin en los DP FULL/PART), `reglas.ts` (`validarDescansoEntreDias`: 18), `reglas.test.ts` (casos 12 h exactas válidos y 11,5 h inválidos), comentarios de `catalogos.ts` («fin ≤ 23:00»), test del validador ahora exige 0 violaciones sobre el fixture real.
- **Pruebas:** `npm test` 98/98 · `tsc` ✅ · build ✅. Validador independiente sobre la salida real del motor: **0 violaciones** (antes 7 descansos de 11,5 h). Impacto con el roster del fixture: cobertura 84,84 % → 84,84 %, faltantes 62 → 62 horas-caja; los turnos se redistribuyen.
- **Relación con D4:** si la sucursal cierra a las 22:30, las jornadas que terminan 23:00 son un tema aparte (D4); esta corrección solo hace que 12 h signifique 12 h reales.
- **Siguiente:** quedan bloqueados por decisiones/autorizaciones #5, #7 (D1–D3), #11/#12 (migraciones); ver informe consolidado.

### ESTADO — VAL-01 (#10) — rama `feat/ah2-val01-validador` — Claude, 2026-11-12

- **Issue:** [#10](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/10) · **PR:** draft (ver Issue #10) · base `main` `9909e87`.
- **Cambios:** `src/algoritmo/validadorIndependiente.ts` — `validarHorario()` puro sobre el horario **de UI** (lo que se edita y publica), independiente del motor, con horas reales. Parámetros en `PerfilNormativo`; `PERFIL_MOTOR_ACTUAL` reproduce lo implementado hoy (estado `PROPUESTO`, sin decidir D1–D3). Valida horas semanales (máx./exactas), francos, cortes ≥ 4 h, bloques por día, horas por día, composición FULL, cantidad de cortadas, **12 h incluido domingo anterior → lunes**, excepciones operativas (franco fijo, entrada/salida, solo mañana/noche, siempre cierre), máximo de francos por día, mínimo de cajeros por franja, integridad de datos; métricas de faltantes/sobrantes por franja. Se eliminó el stub `validarIntegridadResultado` (sin usos).
- **Pruebas:** `npm test` 96/96 (16 nuevos) · `tsc` ✅ · build ✅. La cobertura del validador coincide franja a franja con la del motor en el fixture real.
- **⚠️ Defecto del motor detectado:** sobre la salida real del fixture, 7 jornadas con **11,5 h de descanso**. Causa: `pasada1-fullpart.ts` (`bucketFin`, condición H-D1) y `reglas.ts` (`validarDescansoEntreDias`) cuentan 19 slots nocturnos en vez de 18 (23:00→08:00 = 9 h). Corrección en PR separado (rama `fix/ah2-descanso-12h`, apilada sobre esta).
- **No incluido (es #12):** ejecutar el validador al guardar/publicar.
- **Siguiente:** corrección del descanso 12 h.
### ESTADO — RULES-01 (#11) — rama `feat/ah2-rules01-reglas-v2` — Claude, 2026-11-12

- **Issue:** [#11](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/11) · **PR:** draft (ver Issue #11) · base `main` `9909e87` (independiente de #15–#21).
- **Cambios:** `src/reglas/reglasV2.ts` (puro): modelo `ReglaV2`/`Grupo` (ámbito EMPRESA/SUCURSAL/GRUPO/PERSONA, vigencia SEMANA/MES/RANGO/PERMANENTE evaluada **por día**, nivel OPERATIVA/PREFERENCIA, prioridad, auditoría); `resolverSemana` (precedencia nivel → prioridad → especificidad → reciente; dos OPERATIVAS incompatibles con igual prioridad = **conflicto bloqueante**; con prioridad distinta, la menor queda registrada como sobrescrita; conflictos de franco fijo, turno, ventana vacía, francos fijos sobre el tope, dotación insuficiente para un mínimo y persona inexistente); `compilarParaMotor` (al formato que ya usa el motor, con avisos de lo no representable); `desdeReglasLegacy` (compatibilidad). SQL **propuesto, no aplicado**: `docs/proposals/RULES01_reglas_v2.sql`.
- **Pruebas:** `npm test` 98/98 (18 nuevos) · `tsc` ✅ · build ✅ · mutaciones detectadas. Equivalencia con el pipeline actual (`reglasAExcepciones`, `capFrancosDeReglas`, `demandaMinimaDeReglas`, `configOperativaDeReglas`) verificada en 4 semanas.
- **Corrección (pedido del propietario, 2026-11-12):** dos reglas obligatorias (NORMATIVA/OPERATIVA) incompatibles son **siempre conflicto**, cualquiera sea su prioridad; la prioridad solo ordena **preferencias**. Una OPERATIVA solo se aparta con una **excepción autorizada** (`excepcion`: reglas que reemplaza, autor, fecha, motivo, vigencia acotada; auditada en `reemplazadas`). Nada desactiva una NORMATIVA. Toggles obligatorios opuestos = conflicto. Tests: 25 en el módulo, 105/105 en total; restaurar la lógica anterior hace fallar el test de distinta prioridad.
- **No incluido / dependencias:** UI de carga de vigencia/ámbito/prioridad y persistencia (migración no autorizada); valores normativos (#7, D1–D3: el módulo no contiene ninguno); identidad por id en datos guardados (#9 / SQL de ID-01). La app sigue usando el modelo actual hasta integrar.
### ESTADO — AUX-01 (AUX y eventuales sin carga semanal) — rama `feat/ah2-aux01-disponibilidad-habitual` — Claude, 2026-11-12

- **Diseño:** [`docs/AUX01_DISENO.md`](AUX01_DISENO.md) (arquitectura, decisiones AUX-D1–D4, criterios). Issue AUX-01 en la épica #3.
- **Implementado (sin decisiones laborales ni migraciones):** `src/utils/disponibilidadHabitual.ts` — patrón habitual (`horarioSemanal` actual) + excepciones por fecha con motivo/autor; diagnóstico de supervisión previo con la semántica H-A1/H-A2 del motor. `construirMatrizAux` exportado desde `adapter.ts` (sin cambio de lógica).
- **Pruebas:** `npm test` 89/89 (9 nuevos) · `tsc` ✅ · build ✅.
- **Pendiente:** UI de excepciones y aviso previo; persistencia (migración); planificador de AUX tras AUX-D1–D3.

## HISTÓRICO — FASE 0 (cerrada: PR #2 integrado en `9909e87`)

**Última actualización:** 2026-11-12
**Tarea en curso:** Fase 0 — documentación y protocolo de relevo Astra/Claude **(auditada por Claude, lista para revisión del propietario)** + plan de F1 propuesto (sin implementar).
**Issue:** https://github.com/FernandoDelgadoDiaz/Estimapres/issues/1
**Repositorio:** `FernandoDelgadoDiaz/Estimapres`
**Rama de trabajo:** `docs/aliada-horarios-2-fase0` (creada desde `main` en `02ad9d9d46c3477022dbf1c084b5642c1e996c0c`).
**PR:** https://github.com/FernandoDelgadoDiaz/Estimapres/pull/2 — **DRAFT**, base `main`, creado 2026-11-12, sin merge.
**HEAD:** ver «Registro de relevo — Claude» al final; el SHA del commit que contiene este archivo no puede escribirse dentro de él: confirmar siempre con `git log -1 origin/docs/aliada-horarios-2-fase0` y con el comentario de auditoría en PR #2.
**Plan F1 (propuesto):** [`docs/AH2_FASE1_PLAN.md`](AH2_FASE1_PLAN.md) · Épica [#3](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/3) · sub-Issues #4–#14.
**Autoridad de producto:** propietario. Ningún modelo tiene prioridad sobre otro.


## Estado confirmado previo a editar
- `main`: `02ad9d9d46c3477022dbf1c084b5642c1e996c0c` (última lectura 2026-11-12).
- `docs/` no existía en árbol de `main`; `CLAUDE.md` contenía instrucciones históricas de jerarquía Claude/DeepSeek/ChatGPT y enlaces a `ai/rules.md`.
- El motor actual, tests y base **no** forman parte de F0.
- Supabase restaurado, último estado comprobado `ACTIVE_HEALTHY` (2026-11-12), consultado solo lectura; tiene riesgos P0 de tablas ajenas sin RLS (detalle en MASTER).
- Los datos del POM laboral 16–22/11 se consultaron desde Gmail. **No** subir PDF ni empleados al repo público.

## Checklist de F0
- [x] Inspeccionar `main`, archivos históricos y ramas/PR/Issues.
- [x] Crear rama `docs/aliada-horarios-2-fase0`.
- [x] Crear Issue #1 de continuidad.
- [x] Crear `docs/ALIADA_HORARIOS_MASTER.md` con decisiones y prioridades.
- [x] Crear `docs/CURRENT_WORK.md` con estado verificable de transferencia.
- [x] Crear `AGENTS.md` neutral para ambos modelos.
- [x] Reemplazar `CLAUDE.md` antiguo por enlace al mismo protocolo.
- [x] Abrir PR **draft** #2 y comparar cambios con `main`: inicialmente 4 archivos; tras la auditoría de Claude, 10 archivos, todos documentación (`*.md`).
- [x] Dejar constancia de cierre documental en Issue #1; no fusionar.

## Alcance / no alcance
**Permitido:** solo documentación y metadatos de GitHub de esta fase, en rama no productiva.
**Prohibido en esta tarea:** tocar `src/`, `supabase/`, funciones Netlify, dependencias, datos operativos, RLS, secretos, facturación, despliegues, merges.

## Validación a efectuar
- Revisar en GitHub que los cuatro archivos existen en la rama.
- Confirmar PR draft a `main` y estado de rama.
- Comprobar que cambios se limitan a documentación.
- **No afirmar** npm test/build: esta fase no ejecuta código.

## Bloqueos / riesgos conocidos (no resolver en F0)
1. RLS deshabilitado en siete tablas públicas no específicas del motor, permisos anónimos expuestos; aislamiento pendiente de autorización.
2. Proxy de Claude sin auth/rate limit; riesgo de consumo no autorizado.
3. Motor FULL exactamente 48h vs máximo 48h requerido; PART 31h vs 32h; validación legal/convenio pendiente.
4. Desajuste de slot 22:30, fecha de semana POM, IDs derivados de nombres y publicación sin validador completo.
5. Hasta julio hay dos semanas reales en `semanas_historial`; roster de noviembre no verificado; no publicar datos personales.

## Siguiente acción inequívoca para cualquier modelo
1. **Propietario:** revisar PR #2 (F0 + auditoría + plan F1 propuesto) y decidir merge; responder D1–D5 (plan §3, épica #3).
2. **Tras autorización:** ejecutar **#6 TOOL-01** (lockfile + CI) en rama `feat/ah2-tool01-ci` desde `main` actualizado; es la primera tarea de código, de bajo riesgo y sin datos.
3. En paralelo, si el propietario lo autoriza: #4 (proxy) y #5 (inventario Supabase, solo lectura y SQL propuesto).
No iniciar implementación, migraciones ni despliegues sin esa autorización.

## Registro de relevo — 2026-11-12
- Responsable/modelo: ChatGPT (Astra, rol documental).
- Issue / PR: #1 / #2 draft.
- Base main: `02ad9d9d46c3477022dbf1c084b5642c1e996c0c`.
- Archivos cambiados: `docs/ALIADA_HORARIOS_MASTER.md`, `docs/CURRENT_WORK.md`, `AGENTS.md`, `CLAUDE.md`.
- Validación: comparación GitHub main...rama, solo 4 archivos documentales; npm test/build NO ejecutados (sin cambio de código).
- Supabase: consulta solo lectura para auditoría previa; migraciones NO, modificaciones NO.
- Merge: NO; deploy: NO; gastos: NO.
- Bloqueo: aprobación del propietario del PR #2 y posterior planificación de Issues de F1.
- Acción siguiente: revisar PR #2, pedir decisión explícita de merge; no trabajar en motor antes de ese gate.

## Actualización de alcance funcional — 2026-11-12 (propietario)

- Requisito **AH2-008 APROBADO** documentado en MASTER: flujo normal del supervisor = exportar PDF de POM → cargar en Aliada → obtener cronograma **nominal semanal**, revisar/aprobar → exportar **PDF profesional**. Sin reingreso de matriz, reprogramación manual rutinaria ni necesidad de usar chat con IA.
- Test obligatorio de aceptación: PDF POM válido + dotación y reglas preconfiguradas deben producir cronograma completo legible y PDF exportable; excepciones y déficits se muestran sin violar restricciones.
- El cambio fue **solo documental**, registrado en rama y PR #2; no habilita implementación anticipada de F1.
- Evidencia: commit de MASTER `28d2827342baaf7dbcc2d05d47da4bc7e8ecef79`.
- Próximo paso sin cambio: revisar y aprobar documentalmente PR #2 antes de merge y trabajo de F1.

## Registro de relevo — Claude, 2026-11-12 (auditoría F0 + plan F1)
- Responsable/modelo: Claude (Claude Code), a pedido del propietario.
- Issue / PR: #1 / #2 draft; nuevas #3 (épica F1) y #4–#14.
- Rama / base: `docs/aliada-horarios-2-fase0`, base `main` `02ad9d9d46c3477022dbf1c084b5642c1e996c0c`. HEAD encontrado al empezar: `40d04332499ca053c24c133f5586b0edb6deeaec` (no `15a7113`, que era el último SHA indicado en Issue #1: después hubo `28d2827` y `40d0433` de Astra).
- Auditoría F0 — resultado:
  - Diff `main...rama` = solo `*.md`; **sin cambios de código, datos ni producción** (verificado).
  - Instrucciones de autoridad exclusiva de Claude: reemplazadas en `CLAUDE.md`; pero `ai/rules.md`, `ai/architecture.md` («AUTORIDAD: Claude») y `ai/decisions.md` seguían afirmándola sin aviso → **corregido** con encabezado «HISTÓRICO — NO VIGENTE» en los cuatro `ai/*.md`; nota equivalente en `README.md` (contradice el código: PART 32 vs 31).
  - `AGENTS.md` decía «registrar decisiones solo tras aprobación», mientras MASTER §9 contiene entradas PROPUESTO → **aclarado**: todas en MASTER §9 con su estado; solo las APROBADAS son normativas.
  - `CURRENT_WORK.md` remitía a un «comentario de cierre de Issue #1» inexistente y a un HEAD desactualizado → **corregido**.
  - Clasificación de decisiones AH2-001…008: consistente (AH2-004 correctamente como requisito con validación jurídica pendiente). Añadidas AH2-009/010/011 como PROPUESTO.
  - Afirmaciones técnicas del MASTER §4 verificadas en código; se agregaron hallazgos nuevos (validadores solo en tests, 12 h sin cruce de semanas, parser que tolera negativos/duplicados, relé abierto del proxy, lockfile, sin CI, Supabase compartido con Estimapres [INFERIDO]).
- Pruebas: `npm ci` **falla** (lockfile); `npm install --no-save` + `npx vitest run` → **80/80 OK**; `npm run build` → **OK**. Sobre `40d0433` (código idéntico a `main`).
- Supabase: **no consultado** — el MCP devolvió «sin permiso» para `apbmsjjetejacwzkrlva`. Migraciones NO, escrituras NO. Los datos de BD del MASTER §5 siguen siendo el snapshot de Astra.
- Merge: NO · deploy: NO (Netlify genera deploy previews automáticos del PR; no son producción) · gastos: NO.
- PDF POM original: no accedido; se usaron solo las características documentadas en MASTER §2.
- Bloqueos: autorización de merge de PR #2; decisiones D1–D5.
- Próxima acción exacta: ver «Siguiente acción inequívoca» arriba.

## Plantilla obligatoria al finalizar cada sesión
- Fecha:
- Responsable/modelo:
- Issue y PR:
- Rama / SHA base / HEAD confirmado:
- Cambios realizados (archivos y motivo):
- Pruebas (comando, resultado y evidencia), no ejecutadas:
- Supabase: inspeccionado / migrado / datos modificados (sí/no, detalle):
- Deploy / merge / gastos (sí/no y autorización):
- Bloqueos / decisiones pendientes:
- Próxima acción **exacta**:
