# AH2 — PLAN TÉCNICO DE FASE 1 (y diseño previo de F2/F3)

**Estado:** **PROPUESTO** (registro AH2-009 en [MASTER §9](ALIADA_HORARIOS_MASTER.md#9-registro-único-de-decisiones)). No es normativo y **no autoriza implementación**: cada Issue requiere autorización explícita del propietario antes de empezar.
**Autor / fecha:** Claude, 2026-11-12, sobre `docs/aliada-horarios-2-fase0` (base de código `main` = `02ad9d9`).
**Seguimiento:** Issue épica [#3](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/3) y sub-Issues #4–#14.
**Fuentes:** MASTER (§2 POM, §3 restricciones, §4 diferencias verificadas, §5 riesgos, §6 arquitectura objetivo, AH2-008) y lectura del código citado abajo.

> Mapeo de fases: el pedido del propietario de 2026-11-12 («preparar la Fase 1 para modernizar el motor») abarca lo que el MASTER §8 separa en **F1** (seguridad, contrato POM, normativa, validador, reglas, publicación), **F2** (benchmark CP-SAT) y **F3** (agentes). Este plan respeta esa numeración: F1 es ejecutable tras autorización; F2 y F3 quedan **diseñadas** con Issues propias pero bloqueadas por dependencias. El motor actual **no se reemplaza** en ninguna de ellas.

---

## 1. Línea base verificada (2026-11-12)

| Elemento | Estado verificado | Evidencia |
|---|---|---|
| Tests | `vitest run`: **80/80 OK** (6 archivos) | ejecutado sobre `40d0433` con `npm install --no-save` |
| Build | `npm run build` **OK** (aviso de chunk > 500 kB) | ídem |
| `npm ci` | **Falla**: lockfile desincronizado (falta `esbuild@0.28.2`) | ídem |
| CI | No existe `.github/` | árbol del repo |
| Grilla del motor | 7 × 30 slots desde 08:00 (último slot 22:30–23:00) | `src/algoritmo/adapter.ts`, `validador.ts` |
| Grilla POM | 31 filas 07:00–22:00 (`HORAS_FRANJAS`) | `src/types/index.ts` |
| Semana | se toma `startOfWeek(new Date())`, no el encabezado POM | `src/pages/NuevaSemanaPage.tsx:155` |
| Validador integral | `validarIntegridadResultado` es stub (`ok: true`) | `src/algoritmo/validador.ts` |
| Validadores de reglas | existen (`reglas.ts`) pero solo los llaman tests | grep de llamadas |
| 12 h entre jornadas | solo intra-semana (días 0→6) | `validarDescanso12h` |
| PART | ≤ 31 h (62 slots), 1 franco, solo corridas | `pasada1-fullpart.ts:603`, `reglas.ts` |
| FULL | exactamente 48 h = 3×9 + 2×8 + 1×5, 2 cortadas, 1 franco, corte ≥ 4 h | `reglas.ts` H-F1..H-F7 |
| IDs | `normalizarId(nombre)` | `adapter.ts:38` |
| Edición manual | botón «Guardar de todos modos» | `TablaHorarios.tsx:413` |
| Exportación PDF | existe (`jspdf` + `autotable`) | `src/utils/exportPDF.ts` |
| Proxy IA | relé abierto, CORS `*`, cuerpo arbitrario | `netlify/functions/claude-proxy.ts` |
| Supabase | **no reverificado** por Claude (sin permiso MCP); snapshot de Astra en MASTER §5 | — |

## 2. Brechas entre lo pedido y lo implementado

| Requisito del propietario (AH2-004/005/008) | Implementación actual | Brecha | Issue |
|---|---|---|---|
| 12 h entre jornadas, incluido dom→lun | intra-semana | falta cruce de semanas y validación en publicación | #7, #10 |
| PART ≤ 32 h | ≤ 31 h | constante distinta, no parametrizable | #7 |
| FULL ≤ 48 h | = 48 h con composición fija | ¿máximo o exacto? decisión D1 | #7 |
| FULL 1½ franco | 1 franco + día de 5 h (`franco_medio_corridos`) | definición operativa a confirmar (D2) | #7 |
| PART 1 franco | exactamente 1 | coincide | — |
| Corte ≥ 4 h | FULL ≥ 4 h; PART no corta | coincide; validar fuente legal | #7 |
| Reglas por empleado/grupo/sucursal con vigencia y prioridad | reglas por usuario/sucursal sin vigencia ni prioridad | modelo nuevo | #11 |
| Franco fijo, solo mañana, ventanas entrada/salida | parcial (preferencias aprendidas, no duras) | modelar como reglas operativas duras | #11 |
| Mínimo cajeros por franja, máx. francos simultáneos | existen (`min_cajeros_franja`, `max_francos_dia`) | migrar al modelo v2 con vigencia | #11 |
| Semana del encabezado POM | semana del reloj | parser + UI | #8 |
| Publicación con validación integral | stub + «guardar de todos modos» | flujo borrador→publicación | #10, #12 |
| PDF profesional (AH2-008) | export básico existente | revisar contra criterios AH2-008 | #12 |

## 3. Decisiones pendientes del propietario (bloquean partes del plan)

| ID | Pregunta | Bloquea |
|---|---|---|
| D1 | FULL: ¿«máximo 48 h» permite semanas < 48 h, o el contrato exige 48 h exactas? ¿Se mantiene la composición 3×9 + 2×8 + 1×5 como regla dura, operativa o preferencia? | #7, #10, #13 |
| D2 | Definición operativa del «franco y medio» FULL: ¿día libre + jornada ≤ 5 h? ¿el medio franco debe ser contiguo al franco? | #7 |
| D3 | Fuente jurídica/convencional (CCT 130/75 u otro, contrato individual) y quién la valida (asesor laboral) | pasar AH2-004 a APROBADO normativo |
| D4 | Horario operativo de la sucursal 091: ¿la última demanda es 22:00–22:30 y el cierre de caja es 22:30 o 23:00? | #8 |
| D5 | Tablas `al_*`/`ep_*`: ¿qué producto las usa hoy (Estimapres / prestify)? ¿Se puede activar RLS o hay que migrar a otro proyecto? | #5 |
| D6 | Infraestructura futura para CP-SAT (solo después del benchmark): servicio Python dedicado vs. alternativa | F2 → producción |

## 4. Diseño por bloque

### 4.1 Seguridad (P0, independiente del motor)
- **#4 Proxy IA:** exigir JWT de Supabase verificado en la Function; construir el prompt en el servidor a partir de un payload tipado (no reenviar cuerpo arbitrario); fijar modelo y `max_tokens` por allowlist; CORS restringido al dominio de producción; límite por usuario/día y presupuesto; desactivar en deploy previews o usar clave distinta. Si la función no se usa, deshabilitarla es una opción válida.
- **#5 Supabase:** inventario de las siete tablas, dependencias (código de Estimapres, funciones de pago), volumen y PII; respaldo; plan de RLS o revocación de privilegios `anon`/`authenticated`; corrección de `search_path` en `es_usuario_real`. Entregable inicial: plan SQL **no aplicado** + rollback, para autorización.

### 4.2 Contrato POM v2 (#8)
- `parsePOM(pdf) → { semana: {desde, hasta}, grilla: {inicio, paso: 30, filas}, matriz: number[filas][7], avisos }`.
- Extraer la semana del encabezado/nombre del documento; validar que `hasta − desde = 6 días` y que empiece en lunes; error explícito si es ambiguo.
- Errores (no avisos) para: filas duplicadas, horas fuera de orden, valores negativos o no enteros en «Estimado», columnas ≠ 7, filas faltantes respecto de la grilla esperada.
- Grilla configurable por sucursal (inicio, fin, paso); por defecto la del POM (07:00–22:00, última fila = 22:00–22:30).
- Fixture **sintético** 31 × 7 (sin nombres) que reproduzca las propiedades documentadas: ceros 07:00/07:30, pico 7 el sábado 19:30–21:00 y total **406 horas-caja**; test de regresión que lo verifique. El PDF real no se sube.

### 4.3 Perfiles normativos versionados (#7)
Estructura (propuesta, sin migración):
```text
perfil_normativo { id, nombre, jurisdiccion, convenio, version, vigente_desde, vigente_hasta,
                   fuente (texto + enlace), estado: PROPUESTO|VALIDADO, validado_por, fecha }
restriccion_contrato { perfil_id, contrato: FULL|PART|..., clave, valor, unidad }
  claves: horas_semana_max, horas_semana_min?, descanso_entre_jornadas_min_h,
          francos_semana, medio_franco (definición D2), corte_min_h, bloques_max_dia,
          horas_dia_max, jornada_min_h
```
El motor y el validador **leen parámetros**; las constantes 31/48/62/8 dejan de estar en código. Hasta validar D3, el perfil activo se marca `PROPUESTO` y la UI lo indica.

### 4.4 Validador independiente (#10)
- Función pura `validarHorario(horario, demanda, perfil, reglasVigentes, semanaAnterior?) → { violaciones[], metricas }`, sin depender del motor que generó el horario (debe poder validar la salida del motor actual, de CP-SAT o de una edición manual).
- Violación tipada: `{ codigo, nivel: NORMATIVA|OPERATIVA|PREFERENCIA, colaborador_id, dia, franja?, detalle, regla_id? }`.
- Cubre: horas semanales, francos, medio franco, 12 h (incluido domingo anterior → lunes), corte ≥ 4 h, reglas operativas vigentes, coherencia con disponibilidad; métricas de faltantes/sobrantes por franja.
- Reutiliza la lógica de `reglas.ts` parametrizada; reemplaza el stub; tests con casos válidos e inválidos por cada restricción.

### 4.5 Reglas configurables v2 (#11) — AH2-010
```text
regla { id, tipo, nivel: OPERATIVA|PREFERENCIA, ambito: EMPRESA|SUCURSAL|GRUPO|PERSONA,
        ambito_id, parametros jsonb, vigencia: { desde, hasta|null, recurrencia: SEMANA|MES|PERMANENTE|RANGO },
        prioridad int, activa, creada_por, creada_en, motivo, version }
grupo { id, sucursal_id, nombre }  +  grupo_miembro { grupo_id, colaborador_id, desde, hasta }
```
Tipos iniciales y su compilación a restricción:

| Tipo | Ejemplo | Restricción |
|---|---|---|
| `solo_turno` | solo mañana una semana / un mes | jornadas permitidas ⊆ turno mañana en fechas vigentes |
| `franco_fijo` | franco martes | día = franco |
| `ventana_horaria` | entrar ≥ 09:00, salir ≤ 18:00 | inicio/fin de bloques dentro de ventana |
| `min_cajeros_franja` | ≥ 3 cajeros sáb 18–21 | cobertura ≥ N (dura) |
| `max_francos_dia` | ≤ 2 francos simultáneos | Σ francos del día ≤ N |
| `no_disponible` | licencia, examen | sin bloques en el período |

Precedencia: NORMATIVA > OPERATIVA > PREFERENCIA; dentro de un nivel, mayor `prioridad`, luego ámbito más específico (PERSONA > GRUPO > SUCURSAL > EMPRESA), luego más reciente. Dos reglas operativas incompatibles **no se resuelven en silencio**: el validador las reporta como conflicto y la generación se bloquea hasta que un rol autorizado decida. Migración de las 13 reglas existentes con script reversible (no aplicado sin autorización).

### 4.6 Identidad estable (#9)
Usar `colaboradores.id` (UUID de Supabase) en todo el pipeline; mantener `normalizarId` solo para mapear datos legados; detectar colisiones de nombres como error.

### 4.7 Publicación y PDF (#12) — AH2-008
Estados `BORRADOR → VALIDADO → APROBADO → PUBLICADO` en `semanas_historial` (o tabla nueva), cada uno con autor y fecha; solo se publica si `validarHorario` no tiene violaciones NORMATIVA/OPERATIVA; «Guardar de todos modos» queda limitado a borradores, con advertencia trazada. Guardar con la versión: hash de la matriz POM, perfil normativo, reglas vigentes, roster y motor/configuración. PDF: encabezado sucursal/semana, grilla nominal lun–dom, cortados legibles, francos, totales, estado/versión, anexo de faltantes; test de ida y vuelta (generar → leer texto → comparar).

## 5. F2 — Benchmark motor actual vs OR-Tools CP-SAT (#13)

**Principio:** mismo input, mismo validador, mismas métricas. CP-SAT **no** se integra a producción en F2.

**Interfaz común**
```text
InstanciaPlanificacion { semana, grilla, demanda[7][S], colaboradores[], perfil, reglasVigentes[], semanaAnterior? }
Solver(instancia, {seed, limiteSegundos}) → Horario
```
Exportador TS → JSON de la instancia; el motor actual se envuelve como `Solver`; CP-SAT se ejecuta en Python (OR-Tools) leyendo el mismo JSON. Ambos resultados pasan por `validarHorario` (#10).

**Modelo CP-SAT propuesto**
- Catálogo de jornadas por contrato precomputado (incluye cortadas con corte ≥ 4 h, duraciones permitidas, ventanas); variable booleana `x[e,d,j]` por empleado/día/jornada más `franco[e,d]`.
- Duras: una jornada o franco por día; horas semanales ≤ máximo del perfil; francos por contrato; 12 h mediante pares prohibidos `(d,j)→(d+1,j')` y contra el último día de la semana anterior; reglas operativas vigentes (filtran el catálogo o agregan lineales); `max_francos_dia`; `min_cajeros_franja`.
- Cobertura: `cov[d,s] = Σ x·cubre(j,s)`; `falta[d,s] ≥ dem − cov`, `sobra[d,s] ≥ cov − dem`, enteros ≥ 0.
- Objetivo lexicográfico (dos resoluciones o pesos separados por órdenes de magnitud): 1) minimizar faltantes ponderados (más peso en picos), 2) minimizar sobrantes, 3) minimizar penalizaciones de preferencias/equidad.
- Reproducibilidad: `num_workers=1`, `random_seed` fijo, límite de tiempo; se registra el estado (`OPTIMAL`/`FEASIBLE`/`INFEASIBLE`) y la cota inferior para conocer el **gap**. Si es `INFEASIBLE`, extraer núcleo de supuestos (`assumptions`) para diagnóstico por regla/persona.

**Métricas (por instancia)**: violaciones duras (debe ser 0), horas-caja faltantes y sobrantes, franjas con faltante, faltante máximo en pico, equidad (desvío de cierres/fines de semana), tiempo de cómputo, gap de optimalidad CP-SAT, estabilidad (cambios frente a la semana anterior).

**Instancias**: fixture sintético POM 16–22/11 (§4.2) + variaciones (dotación −1/−2, reglas de mañana, franco fijo, pico extremo, roster reducido infeasible). Sin datos personales.

**Criterio de salida F2**: informe en Issue con tabla de métricas; recomendación argumentada (mantener, híbrido o reemplazar); decisión del propietario registrada en MASTER. Despliegue (D6) se decide después.

## 6. F3 — Capa agéntica supervisada (#14, solo diseño)

- **Herramientas de lectura:** roster, disponibilidad, reglas vigentes, demanda, horario borrador, historial.
- **Simulación:** `simular(cambios_propuestos)` ejecuta el solver sobre una **copia** y devuelve diff + métricas + violaciones.
- **Diagnóstico y explicación:** traduce violaciones/núcleos INFEASIBLE del validador a lenguaje natural; explica por qué una persona tiene un turno usando datos del solver, no inventando motivos.
- **Interpretación de instrucciones:** «la persona A solo mañanas todo noviembre» → borrador de `regla` tipada para confirmar; nunca escribe directamente.
- **Límites:** el agente no calcula legalidad ni cobertura (lo hacen solver y validador); no publica; toda escritura es un borrador que un humano aprueba; permisos por rol; auditoría de cada llamada; presupuesto y límite por usuario; activación por evento, no conversación permanente; el flujo AH2-008 funciona sin agente.
- Requiere #4 cerrado (proxy seguro) y #10/#13 para tener herramientas fiables. Modelo/SDK sin seleccionar (MASTER §6).

## 7. Orden de ejecución y dependencias

```text
#4 SEC proxy (P0) ─┐
#5 SEC Supabase (P0)┤ (independientes del motor; pueden ir en paralelo)
#6 TOOL lock+CI (P1) ──┬─> #8 POM v2 ──────┐
                       ├─> #9 IDs estables ─┼─> #10 Validador ─┬─> #12 Publicación + PDF
#7 NORM perfiles (P1, decisiones D1–D3) ────┤                  │
                                            └─> #11 Reglas v2 ─┤
                                                               └─> #13 Benchmark CP-SAT (F2) ─> #14 Agentes (F3, diseño)
```

**Siguiente tarea ejecutable** (tras merge o autorización de PR #2): **#6** (lockfile + CI), riesgo bajo y sin datos; en paralelo, el propietario responde D1–D5 y autoriza el plan de #4/#5.

## 8. Reglas para quien ejecute
- Una Issue = una rama `feat/ah2-<id>-...` desde `main` actualizado = un PR draft; actualizar `CURRENT_WORK.md` de esa rama.
- Sin migraciones, escrituras de BD, despliegues ni merges sin autorización expresa; los SQL se entregan como propuesta + rollback.
- Ningún cambio altera el comportamiento del motor actual hasta que su Issue lo autorice; los tests existentes (80) deben seguir pasando.
- Sin datos personales en fixtures, Issues o PR.
