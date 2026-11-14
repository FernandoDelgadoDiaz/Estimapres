# ALIADA HORARIOS 2.0 — FUENTE ÚNICA DE VERDAD

**Estado:** normativa vigente de producto, integrada en `main` (PR #2, `9909e87`). Toda decisión nueva se registra en §9 como APROBADO, PROPUESTO o PENDIENTE DE VALIDACIÓN (AH2-018).
**Actualizado:** 2026-11-14 (arquitectura adaptativa §6.1 y contrato de horas PART, Issues #44 y #7)
**Repositorio:** `FernandoDelgadoDiaz/Estimapres`
**Propietario y autoridad de producto:** Fernando (aprueba cambios de alcance, reglas, migraciones, merges, despliegues y gastos).
**Estado operacional y relevo entre modelos:** [`docs/CURRENT_WORK.md`](CURRENT_WORK.md).
**Seguimiento:** [Issue #1](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/1).

> No utilizar recuerdos de chat, documentos históricos ni declaraciones de un asistente como sustituto de la evidencia del repositorio y la base real. Esta especificación es la autoridad normativa **una vez aprobada**. `CURRENT_WORK.md` indica el trabajo en curso; las Issues/PR contienen evidencia. Si hay contradicción, no improvisar: levantarla, proponer decisión y esperar autorización del propietario.

## 1. Propósito del producto

Generar la planificación semanal de cobertura de cajas de supermercados a partir de **demanda externa por franja**, dotación disponible y restricciones por persona/sucursal/convenio. Objetivo: máxima cobertura factible, mínimos faltantes y sobrantes, jornadas válidas y trazables, con aprobación del supervisor.

El producto debe ser **horizontal**: reglas, calendarios, contratos y formatos de ingesta configurables por empresa/sucursal. El caso de referencia inicial es la sucursal 091; no convertir sus particularidades en reglas universales.

No confundir:
- **POM**: origen de la **demanda** de cajas por franja; puede traer una programación ya aprobada, que sirve de comparación, pero no debe imponerse como solución al optimizador.
- **Aliada Horarios**: calcula qué trabajadores cubren la demanda y explica lo posible/imposible.
- **Agente IA (futuro)**: interpreta consultas, ejecuta herramientas seguras, simula y propone; **nunca sustituye** al validador/optimizador ni publica sin autorización.

### Flujo mínimo obligatorio del supervisor — requisito de producto AH2-008

**Regla de experiencia de usuario no negociable:** el supervisor de cajas **no arma ni transcribe manualmente los horarios cada semana**. Su recorrido habitual debe limitarse a:
1. **Exportar el PDF semanal de POM** (sistema externo) y cargarlo en Aliada Horarios, sin copiar tablas ni cantidades a mano.
2. **Generar y revisar**: la aplicación extrae fecha y matriz «Estimado de cajas necesarias», carga automáticamente el roster y las restricciones vigentes guardadas en su sucursal, ejecuta el optimizador y muestra **un cronograma completo con nombres de empleados**, turnos por día, francos, horas por persona y cobertura por franja.
3. **Aprobar y exportar a PDF**: desde la propia aplicación obtiene un **PDF profesional, legible, ordenado y listo para compartir/imprimir**, encabezado con sucursal y semana, grilla semanal de colaboradores, horarios y francos, totales de horas, información de versión/aprobación y, cuando corresponda, un resumen separado de faltantes/alertas.

**Definición de terminado (pruebas de aceptación obligatorias):**
- Dado un PDF POM válido y una sucursal con dotación/reglas previamente configuradas, generar el cronograma de esa semana **sin carga adicional obligatoria de horarios individuales ni reingreso manual de la matriz POM**.
- El resultado tiene **nombres correctos e identificadores estables**, columnas lunes–domingo, turnos legibles (incluidos cortados), francos, total semanal y distingue FULL/PART/AUX/eventuales cuando aplique.
- Un PDF exportado y abierto nuevamente conserva datos, filas, columnas, fechas, cortes de página y legibilidad; se prueba con semanas representativas y plantillas variables.
- El sistema valida todas las restricciones obligatorias **antes de permitir publicación oficial**; si la cobertura completa es imposible, muestra el **mejor resultado factible y un reporte claro de déficit**, sin inventar trabajadores ni transgredir restricciones. El supervisor puede decidir alternativas autorizadas; las reglas normativas no pueden ignorarse.
- El control diario de plantilla, reglas y disponibilidad puede configurarse **fuera de ese recorrido semanal**; no imponer una configuración completa cada vez que se sube un PDF.
- Un agente, si se incorpora, es **invisible u opcional** en el flujo normal: el supervisor no necesita conversar con IA ni escribir prompts para recibir el horario.

**POM aprobado vs salida nueva:** el horario ya incluido en la primera página de POM es referencia comparativa, **nunca** reemplaza el horario optimizado de Aliada. La exportación de Aliada debe producir su propio documento.

## 2. Contrato de entrada POM — referencia real

Correo «POM» del **12/11/2026**, PDF «Programacion semanal 2026-11-16 - 2026-11-22.pdf», **no incluido en este repositorio público** por contener nombres y horarios de empleados.

- Página 1: programación existente por colaborador (referencia de comparación, **no la demanda**).
- Página 3: tabla **«Estimado de cajas necesarias»**, a la derecha: único cuadro de **demanda fuente**. A la izquierda aparece «Diferencia de cajas necesarias», que NO es demanda.
- Filas por día y cada 30 minutos; ejemplo comprobado: **31 franjas desde 07:00 a 22:00**, siete días; 07:00/07:30 tienen cero en el caso; la demanda comienza a las 08:00. El sábado 21/11 llega a **7 cajas entre 19:30 y 21:00**.
- Cada celda significa **cantidad simultánea de cajas necesarias** durante la franja; una celda con valor N equivale a N/2 horas-caja demandadas.
- Debe extraerse **la semana del encabezado** (16–22/11), no la semana actual del reloj. Validar encabezados, franja, fecha, orden de columnas, duplicados, valores anómalos y ausencia de franjas; error explícito ante ambigüedad.
- La última fila 22:00 representa demanda **22:00–22:30**; NO inventar 22:30–23:00 ni descartar 22:00. Confirmar hora operativa por sucursal.
- **Baseline de demanda calculado de esta muestra:** 406 horas-caja entre 08:00 y 22:30 para siete días; medir nuevamente mediante pruebas repetibles. No equivale a horas contractuales.
- Caso de prueba: conservar fixture **anonimizado o sintético** equivalente a la matriz POM, con revisión humana de 31 × 7 celdas (217 valores); no publicar el PDF laboral original sin permiso explícito.

**Problema identificado:** `src/utils/pdfParser.ts` reconoce la tabla por texto, pero el motor usa `7 × 30` slots desde 08:00 (hasta 23:00 en su convención), mientras el ejemplo de POM cubre 08:00–22:30 (29 slots) y `NuevaSemanaPage.tsx` toma la semana actual. Resolver por contrato validado y pruebas, no parcheando una sola pantalla.

## 3. Restricciones: niveles y precedencia

### A. Normativas / contractuales verificadas — duras, no sobrepasables

El producto debe soportar perfiles versionados por país, convenio colectivo, categoría/contrato y vigencia. **Antes de producción cada valor «legal» necesita fuente jurídica o contractual verificable y aprobación explícita.** Una declaración del negocio no valida jurídicamente su carácter legal.

**Requisitos expresados por el propietario (aceptados como objetivos de diseño; situación normativa pendiente de verificar):**
- 12 horas mínimas de descanso entre fin e inicio de jornada; incluye cambio de domingo a lunes de semanas consecutivas.
- PART: no superar **32 horas semanales**. Implementado como perfil de horas vigente (`src/algoritmo/contratos.ts`, AH2-014); el perfil histórico de 31 h se conserva para validar semanas anteriores.
- FULL: no superar **48 horas semanales** (el código actual compone 48 exactas).
- FULL: **un franco y medio** a la semana, cuya definición operativa/convencional debe verificarse; el motor actual representa un día franco y una jornada de 5 h.
- PART: un franco semanal.
- Jornada cortada: al menos **4 horas de separación entre bloques**; confirmar encuadre convencional.
- La validez completa exige revisar adicionalmente períodos de descanso, límite de horas por día, pausas y otras exigencias que determine el convenio/contrato aplicable, sin inventarlas en código.

**Estado:** `REQUISITO DE PRODUCTO APROBADO / BASE LEGAL O CONVENCIONAL NO VALIDADA`. No afirmar que 32h PART, 4h entre bloques o la composición exacta FULL son leyes generales sin evidencia.

### B. Reglas operativas obligatorias — configurables por empresa/sucursal/persona

Ejemplos: «la persona A solo mañanas en la semana del 16/11», «la persona B tiene franco martes», «solo mañanas todo noviembre», máximo de francos simultáneos por día, mínimo de cajeros por franja, presencia de auxiliar de apertura, AUX fuera de caja en cierre. Admitir vigencias **semanal, fechas inicio/fin, mensual y permanente**, ámbito y autor de cada cambio. Aplicarlas **siempre** mientras estén vigentes; para relajarlas se exige decisión de un rol autorizado, historial de cambios y nueva optimización.

No degradar una regla obligatoria a «preferencia» sin consentimiento.

### C. Preferencias blandas — optimizables

Equidad de turnos, rotación de cierres/fin de semana, aprendizajes de correcciones y minimización de costo/sobrantes. Se puede sacrificar preferencia ante una alternativa factible de mayor prioridad. Mantener puntuaciones interpretables y explicar los sacrificios.

### Resolución de conflictos

1. Validar formato/datos y disponibilidad; 2. aplicar todas las restricciones duras normativas; 3. aplicar restricciones operativas obligatorias; 4. maximizar cobertura y minimizar desvíos; 5. optimizar preferencias/equidad/costo con objetivos explícitos.
- Si el problema es inviable, **no producir horario válido ficticio** ni retirar una regla en silencio. Devolver diagnóstico concreto (persona/día/franja/restricción), cobertura factible si aplica y alternativas **propuestas**, sujetas a autorización.
- Un editor humano puede crear borradores excepcionales con advertencia y trazabilidad, pero la **publicación** debe pasar un validador independiente. Ningún agente publica automáticamente ni saltea controles.
- Cada horario debe conservar versión de normativa, reglas, plantilla, PDF/matriz demandada y configuración del optimizador para reproducibilidad.

## 4. Arquitectura actual — constatada en GitHub 2026-11-12

**Código consultado:** `main` en `02ad9d9d46c3477022dbf1c084b5642c1e996c0c` (25/07/2026).

- UI: React + TypeScript + Vite. Backend: Supabase Auth/PostgreSQL, almacenamiento local de respaldo con cola de reintentos.
- `src/utils/pdfParser.ts`: extrae «Estimado de cajas necesarias».
- `src/algoritmo/adapter.ts`: convierte la demanda y el roster al motor.
- `src/algoritmo/orquestador.ts`: 3 pasadas: FULL/PART → AUX → eventuales.
- `src/algoritmo/pasada1-fullpart.ts`: programación dinámica por colaborador y reoptimización iterativa de cobertura; **no garantiza óptimo global conjunto**.
- `src/algoritmo/pasada2-auxiliares.ts`: cobertura residual con presencia de AUX.
- `src/algoritmo/pasada3-eventuales.ts`: distribución de eventuales disponibles.
- `src/utils/preferencias.ts`: rotación, detección de patrones con correcciones y ponderación de cobertura.
- `src/utils/iaAsignacion.ts`: Claude **solo sugiere** cambios después del cálculo; no crea la solución.
- `src/hooks/useHistorial.ts`: versiones semanales; `src/components/semana/TablaHorarios.tsx`: edición manual con advertencias.
- `src/algoritmo/validador.ts`: `validarIntegridadResultado` es actualmente un **stub** que retorna éxito sin validar.

**Diferencias verificadas respecto de requisitos:** PART 31 vs 32; FULL exactamente 48 vs máximo 48; fecha actual vs fecha POM; slot 22:30 artificial; IDs normalizados de nombres con riesgo de colisiones; edición manual permite «Guardar de todos modos»; semana generada se guarda sin flujo formal de borrador→validación→aprobación→publicación. Algunas descripciones históricas de `CLAUDE.md`, `README.md` y `ai/` difieren de la implementación actual; **no son fuente de verdad** para cambios nuevos.

**Auditoría Claude 2026-11-12 (lectura de código en `40d0433`, idéntico a `main` en `src/`):** confirmadas las diferencias anteriores y además:
- `validarSemanaFull`/`validarSemanaPart`/`validarDescanso12h` (`src/algoritmo/reglas.ts`) existen pero **solo se invocan desde tests**; ningún flujo de guardado/publicación las ejecuta.
- El descanso de 12 h se controla **solo dentro de la semana** (lunes→domingo); no existe control domingo→lunes contra la semana anterior.
- La separación de 4 h entre bloques cortados está implementada para FULL (`H-F7`); PART solo admite jornadas corridas (`H-P4`).
- `pdfParser.ts` no extrae fechas del encabezado; convierte valores negativos a 0 con solo un `console.warn`; si hay filas horarias duplicadas, la última sobrescribe sin error; acepta desde 10 filas y completa las faltantes con 0.
- `README.md` declara «PART máximo 32h» mientras el código aplica 31 h (62 slots).
- **Motor — descanso de 12 h (defecto, 2026-11-12):** `pasada1-fullpart.ts` y `reglas.ts` contaban 19 slots entre 23:00 y 08:00 (son 18) y aceptaban descansos de **11,5 h**; detectado por el validador independiente (7 casos en el fixture). Corrección propuesta en PR #20, no integrada.
- **AUX y eventuales:** su presencia/disponibilidad es un patrón fijo cargado a mano en Colaboradores; el motor no la planifica. Si cambia cada semana, contradice AH2-008 (decisión pendiente, ver `docs/HITO_POM_PDF.md`).
- **Datos personales en el repositorio público:** roster semilla (`src/types/index.ts`) y fixtures de tests con nombres y horarios que parecen reales (Issue #23).
- `npm ci` falla: `package-lock.json` no está sincronizado con `package.json`. Con `npm install --no-save`: `vitest run` 80/80 OK y `npm run build` OK. No hay CI (`.github/` no existe).

### 4.1 Estado actualizado — 2026-11-14 (prevalece sobre las diferencias históricas de arriba)

- Motor en tres pasadas corregido (#38/#39): apertura configurable, AUX en caja solo con déficit real, eventuales solo para el déficit residual.
- Validador independiente real (`src/algoritmo/validadorIndependiente.ts` + `src/utils/validacionSemana.ts`): incluye descanso entre semanas, composición de apertura, supervisión H-A2 y cobertura duplicada. Estados VALIDADO / BORRADOR / SIN VERIFICAR.
- Recálculo de la cascada tras ediciones manuales (`src/utils/recalculoSemana.ts`).
- PDF operativo de dos cuadros, caja y presencia (#41).
- **Contrato de horas único** (`src/algoritmo/contratos.ts`, #7): lo usan el adaptador, la pasada 1, H-P1, el validador, la UI y el PDF (AH2-014).
- `ai/*`, `README.md` y partes de este §4 anteriores a esta fecha son antecedentes; el código es la evidencia del comportamiento real.

## 5. Base de datos y seguridad — verificación de solo lectura 2026-11-12

Supabase proyecto **al-iada horarios**, estado `ACTIVE_HEALTHY` al momento de la revisión.

- Cinco tablas pertinentes a horarios con RLS activado: `colaboradores`, `reglas_configurables`, `semanas_historial`, `correcciones_manuales`, `aprendizajes_derivados`.
- Registros constatados (snapshot, no datos de prueba): 22 colaboradores, 13 reglas, 9 versiones de semana **para 2 lunes distintos**, 37 correcciones y 0 aprendizajes materializados. La dotación de julio **no se presume vigente** en noviembre.
- **P0 de seguridad**: siete tablas públicas adicionales `al_*` y `ep_*` tienen **RLS deshabilitado**, y roles `anon`/ `authenticated` tienen privilegios de lectura/escritura. Hay algunos registros en tablas `al_*`. Requiere plan de aislamiento con evaluación de dependencias y respaldo; **no aplicar SQL ni borrar tablas sin autorización**.

**SEC-01 — mitigación propuesta el 12/11/2026, NO desplegada:** Issue [#4](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/4). Como la sugerencia de Claude no participa en el cálculo de turnos, el enfoque más seguro es **desactivar temporalmente toda llamada a Anthropic**: endpoint devuelve 503 en POST sin llamar a proveedores; el cliente ya no utiliza SDK/clave en navegador ni el proxy. La integración opcional con IA volverá solo con autenticación, autorización por rol, validación de payload, límites de uso/costo y pruebas de seguridad. **Mientras no exista deploy autorizado, la versión que ya esté publicada puede conservar el relé inseguro:** no confundir corrección en PR con protección efectiva de producción. No realizar cambios de claves o configuración Netlify sin consentimiento.
- Función `netlify/functions/claude-proxy.ts`: **relé abierto** verificado en código — sin autenticación, `Access-Control-Allow-Origin: *`, reenvía a Anthropic el cuerpo arbitrario recibido (modelo, `max_tokens` y prompt elegidos por el llamador) con `CLAUDE_API_KEY`. Netlify genera **deploy previews por PR** (sitios `prestify` y `al-iada` comentan en PR #2), por lo que la función también puede quedar expuesta en URLs de preview si la variable está disponible en ese contexto (no verificado).
- **Proyecto Supabase compartido (INFERIDO):** `ai/architecture.md` y `ai/contracts.md` documentan que Estimapres (préstamos; contrato `Lender` con `dni`) usa el mismo proyecto con prefijo `ep_`. Las tablas sin RLS podrían contener datos personales de otro producto; el aislamiento debe coordinarse con ese producto y sus funciones de pago (`create-payment.js`, `webhook-mp.js`, este último valida un secreto por *query string*).
- **Vigencia de este apartado:** el snapshot de base fue tomado por Astra; Claude **no pudo reverificarlo** el 2026-11-12 (MCP de Supabase sin permiso sobre `apbmsjjetejacwzkrlva`). Reverificar antes de actuar.
- Revisar además advertencia de linter `es_usuario_real` sin `search_path` fijado.
- **Restricción estricta**: no mostrar/exportar PII de colaboradores a Issues/PR ni publicar PDF laboral; no introducir secretos en el repositorio público.

## 6. Arquitectura objetivo — decisión de dirección, no implementación autorizada

Mantener motor actual hasta contrastar con optimizador alternativo (p. ej. **OR-Tools CP-SAT**) con los mismos fixtures, reglas y demanda. Medir: cumplimiento de reglas duras, faltantes/sobrantes por 30 min, equidad, número de cambios y tiempos; no cambiar el motor por intuición o «más IA».

Flujo deseado:
```text
PDF POM / otra fuente de demanda
  -> normalizador + validación de fechas/franjas
  -> inventario de personal, contratos, licencias y disponibilidades
  -> configuración normativa versionada + reglas operativas + preferencias
  -> optimizador determinístico
  -> validador independiente (incluyendo cruce de semanas)
  -> diagnóstico + borrador -> aprobación humana -> publicación versionada
```

Agente (fase posterior): herramientas de lectura, simulación, explicación y borradores; para cambios sensibles requerir permisos y aprobación humana. Desencadenamiento por evento/cron, no llamadas de IA permanentes; presupuestos y límites. **Aún no seleccionar modelo, SDK o despliegue definitivo.**

### 6.1 Arquitectura de planificación adaptativa — Issue #44

**Dirección aprobada por el propietario (14/11/2026).** El producto evoluciona de un generador semanal aislado a una planificación adaptativa que considera:
- demanda POM por franja;
- contratos y horas semanales por colaborador;
- reglas obligatorias y configuración por sucursal;
- disponibilidad, vacaciones, licencias y ausencias;
- historial de horarios **efectivamente vigentes**;
- continuidad y rotación por ciclo;
- replanificación ante contingencias.

Componentes (los formatos técnicos son **PROPUESTOS**):

```text
POM (snapshot inmutable, matriz día×franja)
  + roster con IDs estables y contrato (objetivo y máximo de horas)       ← tramo A (este PR)
  + reglas versionadas (normativa / operativa / preferencia, con vigencia)
  + ausencias {empleadoId, desde, hasta, alcance, estado, auditoría}       ← tramo D
  + horario publicado vigente y ciclo de planificación                    ← tramo B
    → comparador de demanda POM (Δ por día/franja)                         ← tramo C
    → optimizador determinista: reglas duras → cobertura ≥ objetivo
      → estabilidad dentro del ciclo / rotación al cambiar de ciclo
    → validador independiente + diferencias explicadas
    → BORRADOR → aprobación humana → PUBLICADO (versionado)
```

Reglas de producto (APROBADAS, ver AH2-015…AH2-017):
1. **Continuidad intramensual:** dentro de un mismo ciclo de planificación se minimizan los cambios de turno y franco frente al horario vigente. Se adapta solo lo que exige el POM.
2. **Rotación intermensual:** al iniciar un nuevo ciclo se favorecen cambios visibles y equitativos de turno (mañana, tarde, cierre y fines de semana), contabilizados por semanas efectivas y no por PDF ni versiones. Las reglas individuales de turno fijo prevalecen.
3. **Corte de ciclo explícito:** cada sucursal declara `cicloPlanificacionId` y su fecha de inicio. El cambio de ciclo nunca se deduce solo de que una semana cruce el día 1.
4. **Contingencias:** una ausencia sobre un horario publicado solo replanifica el tramo futuro afectado. Lo ya trabajado nunca se reescribe, y se muestra un diff con mínima cantidad de cambios.
5. **Cobertura objetivo configurable por sucursal:** 95 % en la 091. Es una meta operativa: no es contractual y nunca justifica violar una regla dura.
6. **Aprobación humana antes de publicar.** Ningún agente publica.

Tramos de entrega:

| Tramo | Contenido | Estado |
|---|---|---|
| A | Contrato de horas PART coherente (PR #45; AH2-014, AH2-019…AH2-021) | EN REVISIÓN |
| B | Publicación, vigencia, ciclo y versionado (#10/#12) | PENDIENTE |
| C | Comparación de POM y continuidad/rotación; benchmark #13 | PENDIENTE |
| D | Ausencias y replanificación parcial (#28) | PENDIENTE |
| E | Aprendizaje/agente supervisado (#14) | PENDIENTE |

Cada tramo se entrega en un PR aislado y verificable, sin migraciones ni publicación sin autorización.

## 7. Reglas de trabajo entre modelos (Astra / ChatGPT / Claude)

1. Fuente de verdad **normativa**: este MASTER, luego de su aprobación; fuente de verdad **operativa**: `docs/CURRENT_WORK.md` en la rama correspondiente; evidencia: commits/Issues/PR y estado real de herramientas. Prioridad de autorización: propietario > documentos aprobados > plan de Issue.
2. Leer `AGENTS.md` o `CLAUDE.md`, MASTER, CURRENT_WORK, Issues/PR y estado real de git **antes de implementar**. Nunca continuar desde memoria del chat.
3. Trabajar en una rama de tarea desde un SHA verificado. Una tarea activa/un responsable de cambios por rama; no sobrescribir trabajo simultáneo de otro agente.
4. A cada cierre/suspensión: actualizar CURRENT_WORK con tarea, rama, último SHA verificado, archivos cambiados, comandos de prueba y resultados, SQL aplicado o no, bloqueos y **siguiente comando/acción precisa**. Evidencia en Issue/PR.
5. Distinguir **VERIFICADO / INFERIDO / PROPUESTO / PENDIENTE**. No describir pruebas o despliegues no ejecutados como completados.
6. Sin autorización explícita: **NO** merge, deploy, migraciones, escrituras de BD operativa, borrados, cambios de configuración de pago ni gastos. No registrar secretos o PII.
7. Ante colisión de instrucciones con el MASTER, detener el cambio conflictivo, documentarlo y solicitar decisión; si se aprueba, actualizar el MASTER antes de implementar.
8. Los archivos `ai/architecture.md`, `ai/rules.md`, `ai/decisions.md` son **históricos**; `CLAUDE.md` y `AGENTS.md` deben dirigir a este contrato; no mantener autoridades contradictorias.

## 8. Plan de fases y condiciones de salida

- **F0 — Gobernanza (actual)**: consolidar MASTER/CURRENT_WORK, instrucciones compatibles con ambos modelos y PR draft. Sin código ni BD.
- **F1 — Seguridad + contrato POM + normativa**: resolver P0 de accesos; parser reproducible; semana desde encabezado; perfiles legales/convenio validados; IDs estables; validador independiente y pruebas de cruces semanales. Requiere Issue y autorizaciones específicas.
- **F2 — Benchmark de optimización**: comparar motor actual vs CP-SAT (sin sustitución automática).
- **F3 — Agente de planificación**: simulación/explicación, permisos, auditoría, aprobación.
- **F4 — Piloto y producción**: pruebas de escenarios reales, trazabilidad, monitoreo, multiempresa/multisucursal y despliegue autorizado.

**Plan técnico propuesto para F1 (y diseño previo de F2/F3):** [`docs/AH2_FASE1_PLAN.md`](AH2_FASE1_PLAN.md) — documento de **propuesta**, no normativo; las Issues de ejecución se enlazan desde allí y desde `CURRENT_WORK.md`.

**Criterio de éxito:** con un POM válido, misma dotación y reglas, producir un horario reproducible sin violaciones de restricciones obligatorias; declarar déficits imposibles honestamente; registrar aprobación y medir cobertura y tiempo ahorrado vs programación de referencia. **F0 no constituye aprobación de F1–F4.**

## 9. Registro único de decisiones

| ID | Decisión / solicitud | Estado |
|---|---|---|
| AH2-001 | GitHub y documentación de rama como única continuidad Astra ↔ Claude; dueño aprueba cambios sensibles | **APROBADO por el propietario** |
| AH2-002 | POM «Estimado de cajas necesarias» como matriz demandada; programación POM como comparación | **APROBADO** |
| AH2-003 | Tres niveles: normas/contratos, operativas obligatorias, preferencias; no incumplir duras | **APROBADO como diseño** |
| AH2-004 | 12h entre jornadas; PART ≤32h; FULL ≤48h; 1½ franco FULL; 1 franco PART; 4h entre bloques cortados | **REQUISITO APROBADO / VALIDACIÓN JURÍDICA PENDIENTE** |
| AH2-005 | Reglas por persona y sucursal, con vigencia semanal/mensual/por período/permanente | **APROBADO como diseño** |
| AH2-006 | Evaluar CP-SAT, arquitectura híbrida y agente supervisado sin sustituir motor todavía | **PROPUESTO / benchmark pendiente** |
| AH2-007 | Fase 0 solo documentación, sin merge/deploy/SQL y sin exposición de datos laborales | **APROBADO para ejecutar** |
| AH2-008 | Flujo supervisor POM → generar/revisar cronograma nominal → aprobar/exportar PDF profesional, sin carga manual rutinaria | **APROBADO / REQUISITO FUNCIONAL NO NEGOCIABLE** |
| AH2-009 | Plan F1 en `docs/AH2_FASE1_PLAN.md` con Issues separadas por dependencia; la ejecución de cada Issue requiere autorización específica | **PROPUESTO** (Claude, 2026-11-12) |
| AH2-010 | Modelo de reglas configurables v2: ámbito (empresa/sucursal/grupo/persona), vigencia, prioridad explícita, nivel (normativa/operativa/preferencia) y auditoría; compilado a restricciones para cualquier motor | **PROPUESTO** — esquema en plan F1, sin migración |
| AH2-011 | Benchmark motor actual vs CP-SAT fuera de producción (Python offline sobre fixtures sintéticos); no se elige despliegue de CP-SAT hasta tener resultados | **PROPUESTO** — amplía AH2-006 |
| AH2-012 | Reglas obligatorias (normativas y operativas) vigentes se cumplen **simultáneamente**: si son incompatibles es conflicto explícito, sin importar la prioridad. La prioridad ordena solo preferencias. Una operativa solo se aparta mediante **excepción autorizada** con vigencia acotada, motivo, autor y auditoría. Ninguna normativa se desactiva por preferencia ni excepción | **APROBADO por el propietario** (instrucción del 2026-11-12, implementado en PR #22) |
| AH2-013 | Los grupos de colaboradores se cargan desde la cuenta y sucursal activas. Un grupo vacío permanece vacío y la apertura de pantallas no importa nóminas del dispositivo. Cualquier importación futura debe ser explícita y supervisada. | **APROBADO por el propietario** (2026-11-13) · [PR #30](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/30) |

| AH2-014 | **Contrato de horas único** (`src/algoritmo/contratos.ts`), usado por motor, H-P1, validador, UI y PDF.<br>• Conceptos: `objetivoHoras` = ficha válida; `maximoHoras` = tope del perfil; tope del motor = min(objetivo, máximo), sin asignar por encima de la ficha; `asignadas`/`diferencia` con motivo si no se cumple.<br>• Perfil vigente: PART ≤ 32 h, FULL 48 h sin cambios.<br>• Perfil histórico: PART ≤ 31 h, para validar semanas anteriores.<br>• Si el objetivo no es factible, se informa el máximo factible y la causa; nunca se relajan reglas. La prioridad horas↔cobertura está en AH2-020. | **REQUISITO APROBADO (32 h, AH2-004) / DISEÑO TÉCNICO PROPUESTO / VALIDACIÓN JURÍDICA PENDIENTE** — Issue #7, tramo A, PR #45 |
| AH2-015 | Arquitectura de planificación adaptativa (§6.1): POM + contratos + reglas + ausencias + historial vigente; continuidad intramensual, rotación intermensual, contingencias parciales y aprobación humana | **APROBADO como dirección por el propietario (14/11/2026)**; formatos técnicos PROPUESTOS — Issue #44 |
| AH2-016 | El corte de ciclo mensual es explícito (`cicloPlanificacionId` y fecha de inicio por sucursal); no se deduce del día 1 del calendario | **APROBADO por el propietario (14/11/2026)** — Issue #44 |
| AH2-017 | Cobertura objetivo configurable por sucursal (091: 95 %), operativa y subordinada a reglas duras | **APROBADO por el propietario** |
| AH2-018 | Gobernanza: este MASTER es la única autoridad de producto; `CURRENT_WORK.md` solo registra estado operativo y relevo; `AGENTS.md`/`CLAUDE.md` remiten a ambos; Issues/PR enlazan, no duplican reglas | **APROBADO por el propietario (14/11/2026)** |
| AH2-019 | Cada semana guardada registra el perfil de horas con que se generó (`perfilHorasId` en el jsonb existente, sin migración) y se valida con ese perfil.<br>• **Sin identificador** (semanas anteriores al registro): perfil histórico de 31 h.<br>• **Identificador desconocido**: no se adivina. Se informa como limitación y la semana queda «SIN VERIFICAR» (nunca VALIDADO). | **PROPUESTO** — tramo A, PR #45 |
| AH2-020 | **Prioridad de las horas objetivo PART frente a la cobertura POM — «B conjunta».**<br>• **Decisión del propietario (14/11/2026, APROBADA como dirección de implementación) con condiciones:**<br>&nbsp;&nbsp;(1) Se mantienen todas las reglas obligatorias y las horas contractuales exigibles. **Nunca se reducen horas automáticamente para alcanzar el 95 %.**<br>&nbsp;&nbsp;(2) Multi-arranque para encontrar distribuciones que cumplan las horas y maximicen la cobertura POM.<br>&nbsp;&nbsp;(3) Se incluyen las estrategias comprobadas en el benchmark (en especial las de los escenarios 66 y 156). No se afirma recuperar escenarios que una estrategia faltante no cubra.<br>&nbsp;&nbsp;(4) Solo se eligen soluciones que superan la validación independiente. Entre las que cumplen horas y reglas: mayor cobertura y, después, menos sobrantes.<br>&nbsp;&nbsp;(5) El comportamiento anterior queda como **respaldo**: sin regresiones de cobertura ni de cumplimiento frente a él.<br>&nbsp;&nbsp;(6) Estados separados: «cumplido», «imposible demostrado» y «no encontrado». Una cota individual no demuestra el óptimo global.<br>&nbsp;&nbsp;(7) PR #45 en borrador; sin merge, deploy, migraciones, Supabase ni Prestify. CP-SAT (#13) solo como propuesta de benchmark.<br>• **Implementación (PR #45, tramo A):**<br>&nbsp;&nbsp;– `src/utils/generacionMultiArranque.ts`, usado por `asignarHorariosConIA`. Corre el respaldo (motor anterior en frío, sin cambios) y 6 estrategias con la misma entrada, reglas y prioridad lexicográfica de horas; solo cambian las semanas iniciales de la pasada 1 (`InputAlgoritmo.semillas`), que la DP re-optimiza en la primera pasada:<br>&nbsp;&nbsp;&nbsp;&nbsp;· `desde-sin-prioridad`;<br>&nbsp;&nbsp;&nbsp;&nbsp;· `full-fijos` (escenario 66);<br>&nbsp;&nbsp;&nbsp;&nbsp;· `alternada-1` / `alternada-2` desde el respaldo (escenario 156);<br>&nbsp;&nbsp;&nbsp;&nbsp;· `alternada-ms-1` / `alternada-ms-2` desde `desde-sin-prioridad` (escenario 130).<br>&nbsp;&nbsp;– Un candidato es elegible solo si valida con el mismo contexto que usa la pantalla, sin violaciones que el respaldo no tenga, y si **no baja las horas de ninguna persona** frente al respaldo. Orden de elección: cobertura, luego sobrantes; ante empate gana el respaldo. Presupuesto: 20 s; el respaldo siempre corre y las estrategias omitidas se informan.<br>&nbsp;&nbsp;– `cumplimiento_horas[].estadoObjetivo` toma uno de: `cumplido`, `imposible-demostrado` (cota individual exacta `cotaHoras` < objetivo, con demanda 0 y tope de francos relajado), `no-encontrado` o `sin-objetivo`.<br>&nbsp;&nbsp;– El impacto de la prioridad se mide sobre la solución elegida frente a la cascada sin prioridad.<br>• **Resultados (200 escenarios sintéticos, camino productivo, `AH2_BENCH=1`):**<br>&nbsp;&nbsp;– Cobertura media: 98,631 % → **98,756 %**. Escenarios bajo el 95 %: 7 → 6.<br>&nbsp;&nbsp;– 28 escenarios mejoran (+25,11 pp sumados).<br>&nbsp;&nbsp;– **0 regresiones** de cobertura y de horas frente al respaldo; 0 violaciones.<br>&nbsp;&nbsp;– De los 17 escenarios con brecha frente a «sin prioridad», 15 alcanzan esa cobertura con todas las horas exigibles.<br>&nbsp;&nbsp;– El 130 mejora en parte (98,97 → 99,49 %, frente a 100 % sin prioridad).<br>&nbsp;&nbsp;– El 100 queda **no encontrado** (95,93 % frente a 97,56 %).<br>&nbsp;&nbsp;– Escenario 121: 93,75 → 96,09 % con 32 h a todos.<br>&nbsp;&nbsp;– Tiempo por generación: p50 0,30 s y máximo 0,63 s (antes 0,05 s); con 55 personas, ≈ 2 s.<br>• **Penalización fija de 1.000:** no es la causa. Con 10 o 50 el resultado es idéntico; con 2 se pierden horas exigibles (no admisible). Se conserva.<br>• **Cierre de calidad (PR #45, sin cambiar prioridades ni estrategias):**<br>&nbsp;&nbsp;– **Trazabilidad:** cada semana guarda en `horario_completo.generacion` (jsonb existente, sin migración) la `versionAlgoritmo` (`ah2-v2.1-multiarranque-2026-11-14`), la estrategia elegida, la cobertura del respaldo y la elegida, la mejora en pp, las estrategias omitidas, `sinAlternativas` y la validez. Una semana anterior sin el campo se carga sin error.<br>&nbsp;&nbsp;– **«Elegible» ≠ «válido»:** elegible significa sin violaciones nuevas y sin bajar horas; válido, cero violaciones. Cada candidato informa `violacionesNuevas`, `violacionesPreexistentes` y `totalmenteValido`.<br>&nbsp;&nbsp;&nbsp;&nbsp;· Si la solución elegida hereda violaciones del respaldo, queda `validacion = con-violaciones-preexistentes`: aviso explícito, **BORRADOR** y nunca publicable (lo decide el validador independiente).<br>&nbsp;&nbsp;– **Omitidas:** si el presupuesto se agota antes de empezar, se informan todas las alternativas (`sinAlternativas = presupuesto-agotado`). Sin objetivo de horas: `sin-objetivo-horas`, sin omitidas.<br>&nbsp;&nbsp;– **Interfaz:** el cálculo bloquea el hilo de la interfaz.<br>&nbsp;&nbsp;&nbsp;&nbsp;· Medido en navegador: 0,5 s / 3,0 s (091, 9 cajeros, CPU 1× / 6×) y 3,3 s / 21,2 s (55 cajeros).<br>&nbsp;&nbsp;&nbsp;&nbsp;· Con 35 cajeros a 6× puede agotarse el presupuesto, y entonces el resultado depende del equipo.<br>&nbsp;&nbsp;&nbsp;&nbsp;· Mitigación incluida: se cede un cuadro para que se pinte «generando…».<br>&nbsp;&nbsp;&nbsp;&nbsp;· Solución de fondo **PROPUESTA** en otro PR: Web Worker con cancelación y, opcionalmente, corte por trabajo en lugar de por tiempo (`docs/proposals/AH2-020_WEB_WORKER_GENERACION.md`).<br>• **Pendiente:** certificar los «no encontrados» y la brecha real con CP-SAT (#13, propuesta en `docs/proposals/AH2-020_BENCHMARK_CPSAT_ISSUE13.md`; no productivo). | **APROBADO (dirección B conjunta con condiciones, 14/11/2026) / IMPLEMENTADO EN PR #45 BORRADOR / MERGE Y DEPLOY NO AUTORIZADOS** — Issue #7 |
| AH2-021 | **Ficha PART sin horas o inválida.**<br>• Se distinguen tres casos: **faltante** (sin dato), **inválida** (0, negativa, no numérica) y **válida**.<br>• Faltante o inválida: no se asume ningún objetivo. Se planifica sin objetivo, hasta el máximo del perfil, y la validación marca `DATOS_HORAS_FICHA` (BORRADOR) con un mensaje distinto para cada caso.<br>• Válida por encima del máximo, o fuera de la grilla de 30 min: se ajusta y se avisa, sin bloquear.<br>• Al cargar desde Supabase, un PART sin horas ya no se convierte en 48 h. FULL conserva 48 h. | **PROPUESTO** — PR #45 |
| AH2-022 | Incorporación de otras sucursales de la misma empresa: requisito **independiente** de los tramos de #44. No se modifican autenticación, aislamiento de sucursales ni permisos en los PR de horas. | **REQUISITO REGISTRADO / DISEÑO PENDIENTE** |

**Cualquier decisión nueva se registra aquí y enlaza Issue/PR; no crear otros registros de decisiones independientes.**
