# CURRENT WORK — ALIADA HORARIOS 2.0

## PUNTO ÚNICO DE RETOMA — tramo B: diseño de ciclos, aprobación y publicación · 2026-11-15

> Leer primero `docs/ALIADA_HORARIOS_MASTER.md` (§6.1 y §9, en especial AH2-015, AH2-016, AH2-022 y AH2-023). Después `docs/AH2_TRAMO_B_DISENO.md`, esta sección y el PR documental de la rama activa.

- **Responsable:** Claude (Claude Code), 2026-11-15.
- **Issues:** #44 (tramo B) y #12 (PUB-01). Dependencia de acceso multisucursal: AH2-022.
- **Rama:** `claude/aliada-horarios-continuidad-7suuva`, creada desde `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. El SHA exacto de la rama figura en el PR documental.
- **Alcance:** **solo documentación.** No se implementa el tramo B; sin migraciones, Supabase, datos operativos, Prestify, motor, merge ni deploy.

### Estado real verificado de producción (15/11/2026)
- **PR #45:** `merged` por el propietario el 14/11/2026 a las 23:26 UTC. Commit de merge `905cb75`, con el mismo árbol que `21695d9`. `origin/main` = `905cb75`.
- **CI `#39`** (push a main, `905cb75`): `success`.
- **Netlify, sitio `al-iada`:** deploy de producción actual `6af8ee2dae9d7a3ca54d5aef`, `commit_ref = 905cb75`, `context = production`, `state = ready`, publicado el 14/11/2026 a las 23:27:02 UTC.
- **Comprobación externa:** `https://al-iada.netlify.app` sirve `assets/index-QDVVeo70.js`, que contiene `ah2-v2.1-multiarranque-2026-11-14`.
- Por lo tanto el tramo A está **en producción**. Las secciones siguientes que dicen «sin merge», «borrador» o «producción en `c8d6fa8`» son **históricas**.

### Qué se hizo en esta etapa
- **MASTER:** tramo A marcado como integrado y publicado (§4.1, §6.1, AH2-014, AH2-019, AH2-020 y AH2-021). Se agregan los hechos sin cambiar el estado aprobado o propuesto de ninguna decisión; AH2-019 y AH2-021 quedan para que el propietario los ratifique. Se agrega **AH2-023 (PROPUESTO)**.
- **`docs/AH2_TRAMO_B_DISENO.md`:**
  - estado actual verificado;
  - conceptos;
  - modelo de datos en TypeScript;
  - máquina de estados;
  - invariantes I1–I11;
  - vigencia y ciclo;
  - modalidades semanal y mensual de 4–5 semanas;
  - semanas legadas;
  - contrato `ContextoContinuidad` con el tramo C;
  - experiencia del supervisor;
  - arquitectura para 160 sucursales: herencia empresa → zona → sucursal, roles, volumen, despliegue gradual;
  - plan B1–B4;
  - dependencias;
  - criterios de aceptación;
  - decisiones D1–D8;
  - riesgos.
- **Hallazgo clave para la escala:** la política de acceso del repositorio para `semanas_historial` es por usuario (`local_id = auth.uid()`). No permite varios usuarios por sucursal ni un aprobador distinto del supervisor. B4 y el despliegue a escala dependen de AH2-022.
- **Límite:** el «prompt anterior» con el alcance de las 160 sucursales no está en el repositorio ni en esta sesión. Si tiene requisitos adicionales, se incorporan antes de aprobar (D8).

### Próxima tarea exacta
1. El propietario revisa el PR documental y resuelve D1–D8.
2. Si autoriza **B1** (módulo puro `src/planificacion/` con pruebas, sin cambios de UI ni migración): crear una rama desde `main` actualizado e implementar solo B1 con los criterios del §12.
3. B2–B4 requieren cada uno su propia autorización. B4 requiere además AH2-022 y autorización de migración.

### Para retomar (Claude u OpenAI)
1. `git fetch origin && git checkout claude/aliada-horarios-continuidad-7suuva`
2. Leer MASTER (AH2-023) y `docs/AH2_TRAMO_B_DISENO.md`.
3. No implementar, fusionar ni publicar sin autorización expresa del propietario.

## Registro histórico — tramo A: contrato de horas PART (PR #45, integrado el 14/11/2026 en `905cb75`)

> **Histórico.** Lo que sigue describe el estado previo al merge. La situación actual está en el «PUNTO ÚNICO DE RETOMA» de arriba.

> Leer primero `docs/ALIADA_HORARIOS_MASTER.md` (§6.1 y §9 AH2-014…AH2-022, en especial AH2-020 APROBADO), después esta sección y el PR de la rama activa.

- **Responsable:** Claude (Claude Code), 2026-11-14.
- **Issues:** #7 (perfiles y horas PART) y #44 (arquitectura adaptativa, tramo A).
- **PR:** [#45](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/45), en borrador.
- **Rama:** `feat/ah2-part-horas-contrato`.
  - Base: `main@587192046cf59fcde22e62b14a41ce5bf22df9c5`.
  - Commits de código: `e11ecc0` (tramo A), `cf6814a` (revisión final) `c34da2c385a56ac0eacad6b0b76412273750518b` (benchmark AH2-020) y el commit de «B conjunta» (AH2-020 aprobado). El HEAD exacto figura en el PR y en el reporte de entrega.
- **Estado:** sin merge, sin deploy, sin migraciones, sin escrituras en Supabase. Producción sigue en `c8d6fa8` (#41). El PR #42 de rollback no se tocó.

### Qué se hizo
- **Defecto corregido.** El límite de 31 h estaba fijo en tres lugares, en lugar de seguir la ficha de 32 h:
  - `pasada1-fullpart.ts` (`MAX_SLOTS_PART = 62`);
  - H-P1 en `reglas.ts`;
  - el perfil PART del validador.

  Además, la UI sumaba 32 h de capacidad y el adaptador no le pasaba al motor las horas de ficha.
- **Contrato único** en `src/algoritmo/contratos.ts`:
  - `objetivoHoras` = ficha;
  - `maximoHoras` = tope del perfil;
  - tope del motor = min(ficha, máximo): nunca se asigna por encima de la ficha;
  - `cumplimiento` con asignadas, diferencia, máximo factible y motivo.
- **Perfiles:**
  - vigente `horas-2026-11-part32` (PART ≤ 32 h, FULL 48 h sin cambios);
  - histórico `horas-2026-07-part31`.
- **Pasada 1:**
  - tope por persona en la DP;
  - las horas objetivo tienen prioridad lexicográfica sobre la cobertura (penalización 1000 por cada media hora faltante);
  - si el objetivo no se alcanza, se calcula el máximo factible con las reglas de la persona y se informa el motivo;
  - no se relaja ninguna regla.
- **Validador:** `PERFIL_MOTOR_ACTUAL` (32 h) y `PERFIL_MOTOR_HISTORICO_31` derivan del mismo contrato.
- **Semanas guardadas:**
  - guardan `perfilHorasId` y `cumplimientoHoras` en el jsonb `horario_completo`, sin migración;
  - Último Horario valida cada semana con su perfil;
  - una semana sin perfil registrado se valida con el histórico de 31 h.
- **UI:** la capacidad usa el contrato; el validador avisa «X h asignadas de Y h objetivo».
- **Gobernanza:**
  - MASTER §4.1, §6.1 y §9 (AH2-014…AH2-019);
  - AGENTS.md y CLAUDE.md con la jerarquía MASTER → CURRENT_WORK → PR;
  - esta sección pasa a ser el único punto de retoma (la anterior quedó como registro histórico).

### Cierre de calidad del PR #45 · 2026-11-14 (sobre `86bb019`)
Sin cambios en prioridades ni en estrategias de optimización. Es el mismo selector, con estos agregados:
1. **Persistencia de la generación.**
   - `SemanaHistorial.generacion` (`RegistroGeneracion`) guarda: `versionAlgoritmo` (`VERSION_ALGORITMO = ah2-v2.1-multiarranque-2026-11-14`), `estrategia`, `coberturaRespaldoPct`, `coberturaElegidaPct`, `mejoraPp`, `omitidas`, `sinAlternativas` y `validacion`.
   - Viaja en `horario_completo.generacion`, el jsonb existente, sin migración.
   - Nueva Semana lo guarda al generar. Describe la generación, así que no cambia con ediciones manuales (para eso está `editadoManualmente`).
   - Pruebas:
     - ida y vuelta por la fila de Supabase (`semanaAFila` / `filaASemana`) y por JSON (localStorage);
     - presupuesto agotado;
     - semana anterior sin el campo;
     - E2E: guardado en el navegador y conservado tras recargar.
2. **«Sin violaciones nuevas» ≠ «totalmente válido».**
   - Cada candidato informa `violacionesNuevas`, `violacionesPreexistentes`, `elegible` y `totalmenteValido`. La selección informa `validacion` (`valida` / `con-violaciones-preexistentes`) y `violacionesElegida`.
   - Si la solución elegida hereda violaciones del respaldo:
     - aviso «Multi-arranque: … No es publicable: queda en BORRADOR»;
     - el validador independiente la marca BORRADOR y `publicable = false`;
     - tras una edición manual el aviso se retira, porque la validez pasa a informarla el validador.
   - Prueba con 20 cajeros y el tope predeterminado de 2 francos por día, donde el respaldo ya deja personas sin semana.
3. **Estrategias omitidas.**
   - Si el presupuesto se agota antes de empezar las alternativas, se informan todas (`sinAlternativas = presupuesto-agotado`). Antes quedaba `omitidas: []`.
   - Sin objetivo de horas: `sin-objetivo-horas`, sin omitidas.
   - Prueba con reloj simulado: para 6 presupuestos, cada estrategia queda corrida u omitida, nunca en silencio, y las dependientes de una omitida también se omiten.
4. **Navegador y equipos lentos.** `e2e/rendimiento.perf.ts` con `playwright.perf.config.ts`: build de producción, CPU ralentizada por CDP. No integra la suite E2E.
   - Interfaz congelada (tarea larga máxima, en s), multi-arranque [respaldo solo]:

     | Cajeros | 1× | 4× | 6× |
     |---|---|---|---|
     | 9 (091) | 0,5 [0,2] | 2,0 [0,5] | 3,0 [0,7] |
     | 20 | 1,1 [0,3] | 4,7 [1,2] | 7,4 [1,9] |
     | 35 | 3,2 [0,6] | 13,8 [2,3] | 20,6 [3,2] |
     | 55 | 3,3 [0,7] | 13,8 [3,0] | 21,2 [4,5] |

   - Antes de este cierre, el indicador «generando…» **no se pintaba**. Ahora `asignarHorariosConIA` cede un cuadro antes de calcular y se pinta en las 12 combinaciones.
   - Con 35 cajeros a 6× se omitió `alternada-ms-2` en una de dos corridas: en equipos lentos el resultado puede depender del equipo, aunque queda registrado en `generacion.omitidas`.
   - Reproducir: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build && PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chromium> npx playwright test -c playwright.perf.config.ts` (opcional `AH2_PERF_OUT=<json>`).
   - **Web Worker: PROPUESTO** en un PR separado (`docs/proposals/AH2-020_WEB_WORKER_GENERACION.md`). Recomendado antes de sucursales de 20 o más cajeros o de equipos lentos. Para la 091 no es imprescindible.
5. **Verificación del cierre:**
   - TypeScript: OK.
   - Vitest: **366 aprobadas**, 3 omitidas (+9 pruebas nuevas, 23 en `generacionMultiArranque.test.ts`).
   - Build: OK.
   - Playwright: **11/11** (incluye la persistencia de `generacion` tras recargar).
   - Rendimiento: 12/12 combinaciones.
   - Benchmark de 200 escenarios: **idéntico** a `86bb019` (0 diferencias de cobertura, estrategia u horas). Cobertura media 98,756 % (respaldo 98,631 %); 0 regresiones; 0 violaciones.
   - `npm run lint` sigue sin configuración (preexistente).

### B conjunta implementada — AH2-020 APROBADO (dirección, con condiciones) · 2026-11-14
- **Qué cambia en producción (al mergear, no autorizado aún):** `asignarHorariosConIA` ya no corre el motor una sola vez. Llama a `generarConMultiArranque` (`src/utils/generacionMultiArranque.ts`).
  - **Respaldo:** el motor anterior en frío, sin cambios. Siempre corre y siempre es elegible.
  - **6 estrategias,** con la misma entrada, reglas y prioridad lexicográfica de horas: `desde-sin-prioridad`, `full-fijos` (escenario 66), `alternada-1/2` (desde el respaldo; escenario 156) y `alternada-ms-1/2` (desde `desde-sin-prioridad`; escenario 130). Solo cambian las semanas iniciales de la pasada 1 (`InputAlgoritmo.semillas`, ahora formal), que la DP re-optimiza en la primera pasada.
  - **Elegibilidad:** el candidato valida con `validarResultadoSemana` y el MISMO contexto que usa Nueva Semana (que ahora lo arma antes de generar), sin violaciones que el respaldo no tenga, y sin bajar las horas de ninguna persona frente al respaldo.
  - **Elección:** mayor cobertura, luego menos sobrantes; ante empate, el respaldo.
  - **Presupuesto:** 20 s. Las estrategias omitidas se informan en `resultado.multiArranque`, que se guarda sin tiempos para que el resultado sea reproducible.
- **Motor:**
  - `cumplimiento_horas[].estadoObjetivo` ∈ {`cumplido`, `imposible-demostrado`, `no-encontrado`, `sin-objetivo`}.
  - `cotaHoras` es la cota individual exacta: demanda 0, sin francos de otros, tope de francos relajado. Prueba imposibilidad por persona, **no** el óptimo global.
  - `compararImpactoHoras` mide el impacto sobre la solución elegida frente a la cascada sin prioridad. `omitir_impacto_horas` evita duplicar el cálculo.
  - `experimental` conserva solo la penalización (análisis offline).
- **Resultados, 200 escenarios por el camino productivo** (`AH2_BENCH=1 AH2_BENCH_N=200`, columna `PROD`, ≈ 2 min):
  - Cobertura media: 98,631 → **98,756 %**. Escenarios bajo el 95 %: 7 → 6.
  - 28 escenarios mejoran (+25,11 pp sumados).
  - **0 regresiones** de cobertura y de horas; 0 violaciones.
  - Estrategia elegida: actual 121, desde-sin-prioridad 37, full-fijos 22, alternada-1 11, alternada-ms-1 6, alternada-2 2, alternada-ms-2 1.
  - De los 17 escenarios con brecha frente a «sin prioridad», 15 alcanzan esa cobertura con todas las horas exigibles.
  - El 130 mejora en parte (98,97 → 99,49 %, frente a 100 %). El 100 queda **no encontrado** (95,93 % frente a 97,56 %). No se afirma recuperar los 17.
  - Tiempo: p50 0,30 s y máximo 0,63 s (antes 0,05 s). Con 20, 35 y 55 personas: 0,9 s, 2,0 s y 2,0 s, sin violaciones ni estrategias omitidas.
- **Pruebas nuevas:** `src/utils/__tests__/generacionMultiArranque.test.ts` (14).
  - Escenarios 121, 66 (solo `full-fijos` lo logra), 156, 130 (parcial, sin afirmar el 100 %) y 100 (respaldo).
  - Estados de horas.
  - Presupuesto 0 → idéntico al motor anterior.
  - Fichas sin dato → solo respaldo.
  - Reproducibilidad.
  - 40 escenarios sin regresión.
  - Semana 47.
  - Dotación grande.
- **Pruebas adaptadas:**
  - La semana 47 (`aperturaHelpers.generar`) corre ahora por el camino productivo; todas sus pruebas pasan.
  - SEC-01 compara contra el multi-arranque determinístico.
- **Verificación:** TypeScript OK; Vitest **357 aprobadas**, 3 omitidas; build OK; Playwright **11/11**. `npm run lint` no corre: el repo no tiene configuración de ESLint (preexistente).
- **Propuesta separada CP-SAT (#13):** `docs/proposals/AH2-020_BENCHMARK_CPSAT_ISSUE13.md`. Offline, no productiva.

### Benchmark de prioridad de horas vs cobertura (`c34da2c`) — AH2-020, evidencia previa a la aprobación
- **Orientación del propietario:** se prefiere la alternativa B (cobertura), pero no se reducen automáticamente horas contractuales exigibles. El motor productivo **no cambió**.
- **Método:** benchmark offline reproducible.
  - Comando: `AH2_BENCH=1 AH2_BENCH_N=200 AH2_BENCH_OUT=<json> npx vitest run src/algoritmo/__tests__/benchmark/prioridadHoras.bench.test.ts`, unos 60 s.
  - 200 escenarios sintéticos con semilla fija (`fixtures/escenariosSinteticos.ts`).
  - En todos, la solución sin prioridad (A0) y la del motor actual (H1000) **validan sin violaciones**: ninguno tiene una persona infactible.
  - Estrategias: A0, H1000, penalizaciones 50, 10 y 2, y multi-arranque desde A0 (MS).
  - Para habilitarlas, la pasada 1 ganó parámetros `experimental` desactivados por defecto. Está probado que sin ellos el resultado es idéntico.
- **Horas:**
  - H1000 alcanza la meta de horas en 200/200.
  - En 42 escenarios el objetivo de 32 h es **inviable demostrado**: una cota exacta por persona, que relaja solo el tope de francos por día, da 24 o 30 h.
- **Cobertura:**
  - 183 sin brecha.
  - 13 «factible encontrada» con el mejor entre H1000 y MS.
  - 2 más encontradas con estrategias extra (66: semanas FULL fijas; 156: arranques alternados).
  - **2 no encontradas**, sin prueba de imposibilidad: escenario 100 (95,93 % frente a 97,56 %) y 130 (99,49 % frente a 100 %).
  - Escenario 121: H1000 93,75 % → multi-arranque 96,09 %, con 32 h y validado. Es la prueba concluyente de que la pérdida era un óptimo local.
- **Penalización de 1.000:** no es la causa.
  - 10 y 50 dan el mismo resultado en los 200 escenarios.
  - 2 pierde horas exigibles en 93 escenarios (782 h) y además empeora la cobertura media (−0,02 pp).
- **Medias de cobertura:** H1000 98,63 %; mejor entre H1000 y MS 98,72 %. En los 18 escenarios donde mejora, +0,99 pp (máximo +2,34).
- **Propuesta «B conjunta»** (MASTER AH2-020):
  - horas exigibles como restricción (objetivo o cota probada);
  - multi-arranque con selección del mejor validado (+60–80 ms);
  - tres estados explícitos;
  - aviso bajo el 95 % sin recortar horas;
  - **benchmark de CP-SAT (#13)** para certificar los «no encontrados».
- **Pruebas en CI:**
  - `prioridadHorasOptimo.test.ts`: 6 casos.
  - La prueba con P0 infactible quedó marcada como no concluyente.
  - TypeScript y build: OK. Vitest: 343 aprobadas, 3 omitidas (incluido el benchmark). Playwright: 11/11.

### Revisión final (`cf6814a`) — los cuatro puntos pedidos
1. **Prioridad de horas PART frente a cobertura** (AH2-020, PROPUESTO; decisión del propietario pendiente).
   - La prioridad no cambió.
   - El orquestador corre además la misma cascada sin esa prioridad (`impacto_horas`). Informa la cobertura con y sin ella, las franjas que empeoran (marcando picos), los sobrantes agregados y si la cobertura cae bajo el 95 % solo por las horas.
   - Búsqueda en 120 escenarios sintéticos:
     - 5 bajan la cobertura (siempre en un pico);
     - 1 cae de 95,59 % a 93,38 %;
     - 116 agregan sobrantes.
   - Los casos 59 y 95 quedaron como fixtures en `src/algoritmo/__tests__/fixtures/prioridadHorasAdversarial.ts`.
   - Semana 47: la cobertura no baja; +0,5 h de sobrante (genera una página de alertas en el PDF).
2. **Ficha PART** (AH2-021).
   - Se distinguen tres casos: faltante, inválida (0, negativa, no numérica) y válida.
   - Faltante o inválida: se planifica sin objetivo, hasta el máximo del perfil, con `DATOS_HORAS_FICHA` (BORRADOR) y un mensaje distinto por caso.
   - Ficha de 36 h → se planifica con 32 y se avisa. Ficha de 31,75 h → 31,5 con aviso.
   - Al cargar desde Supabase, un PART sin horas ya no se convierte en 48 h (FULL sigue en 48). Colaboradores muestra «Sin dato» y el formulario permite dejar el campo vacío.
3. **Edición manual.**
   - `aplicarEdicionConRecalculo` recalcula `cumplimientoHoras` desde las jornadas editadas: motivo «modificadas manualmente» y sin el factible anterior.
   - Regenera los avisos «Horas PART» y descarta `impactoHoras`.
   - Nueva Semana y Último Horario persisten el cumplimiento nuevo (probado ida y vuelta con `semanaAFila` y `filaASemana`).
4. **Perfil de horas** (AH2-019).
   - `resolverPerfilHorasSemana`: sin identificador → histórico 31 h; identificador conocido → ese perfil; desconocido → limitación, la semana queda «SIN VERIFICAR» (nunca VALIDADO).
   - La validación de Último Horario lo resuelve vía `perfilHorasId`.

**Defectos confirmados en el HEAD anterior `1f3fab4`** (worktree temporal):
- Una ficha faltante o en 0 se convertía en 32 h y la semana salía VALIDADO.
- Un perfil desconocido se validaba como 31 h sin aviso.
- Tras editar a 31 h, el cumplimiento seguía diciendo 32 h.
- No se informaba el costo de priorizar las horas.

**Pruebas sobre `cf6814a`:**
- TypeScript y build: OK.
- Vitest: **337 aprobadas**, 2 omitidas.
- Playwright: **11/11**.
- `prioridadHorasRevision.test.ts`: 12 casos nuevos.

**Fuera de alcance (sin cambios):** autenticación, aislamiento de sucursales y permisos. La incorporación de otras sucursales es un requisito independiente (AH2-022).

### Archivos modificados
- **Motor y contratos** (`src/algoritmo/`): `contratos.ts` (nuevo), `adapter.ts`, `pasada1-fullpart.ts`, `orquestador.ts`, `reglas.ts`, `types.ts`, `validadorIndependiente.ts`.
- **Validación, tipos y persistencia:** `src/utils/validacionSemana.ts`, `src/utils/almacen.ts`, `src/types/index.ts`.
- **Páginas:** `src/pages/NuevaSemanaPage.tsx`, `src/pages/UltimoHorarioPage.tsx`.
- **Revisión final:**
  - `src/hooks/useAsignacion.ts`;
  - `src/components/colaboradores/FormColaborador.tsx` y `TablaColaboradores.tsx`;
  - `src/utils/algoritmoAsignacion.ts`;
  - `src/algoritmo/orquestador.ts` (impacto de la prioridad de horas);
  - `src/utils/almacen.ts` (carga de PART sin horas; conversiones exportadas para pruebas).
- **Pruebas:**
  - `src/algoritmo/__tests__/contratoHorasPart.test.ts` (nuevo, 24 casos);
  - `reglas.test.ts` y `validadorIndependiente.test.ts` (adaptadas al perfil vigente).
- **Documentación:** `docs/ALIADA_HORARIOS_MASTER.md`, `AGENTS.md`, `CLAUDE.md`, este archivo.

### Pruebas (sobre `e11ecc0`)
- TypeScript: OK. Build: OK.
- Vitest: **325 aprobadas**, 2 omitidas (locales).
- Playwright: **11/11**.
- `contratoHorasPart.test.ts`:
  - 5 PART con 32 h en las 4 combinaciones apertura ON/OFF × franco y medio ON/OFF;
  - VALIDADO completo (descansos, francos, apertura, H-A2);
  - horas del PDF = jornadas;
  - cobertura no menor que la del motor anterior;
  - ficha de 31 h → 31;
  - objetivo inalcanzable (regla «no después de 13:00» → máximo factible 24 h con motivo y aviso);
  - imposible (ninguna semana válida → diagnóstico);
  - semanas históricas válidas con su perfil;
  - 32 h contra el perfil histórico → `NORM_HORAS_MAX`;
  - edición a 32,5 h → violación; edición a 30 h → aviso.
- **Detección del defecto:** con la implementación anterior, 14/24 de esas pruebas fallan (31 donde se esperan 32).

### Comparación con el motor anterior (semana 47 anonimizada: 4 FULL, 5 PART con ficha de 32 h, 3 AUX, 3 eventuales)
El «anterior» es el mismo motor ejecutado con el perfil histórico de 31 h, que reproduce exactamente el comportamiento previo.

#### apertura solo AUX ON · franco y medio corridos OFF
| métrica | anterior (31 h) | nuevo (32 h) |
|---|---|---|
| horas PART totales | 155 | 160 |
| cobertura | 98.65 % | 98.65 % |
| horas-caja faltantes | 5.5 | 5.5 |
| horas-caja sobrantes | 1.5 | 2 |
| horas AUX en caja / eventuales en caja | 32 / 23 | 30 / 20.5 |
| tiempo de cálculo | 117 ms | 66 ms |
- Franjas que mejoran: ninguna
- Franjas que empeoran: ninguna
- Faltantes que permanecen: Vie 08:00: 1, Sáb 08:00: 1, Vie 08:30: 1, Sáb 08:30: 1, Sáb 09:00: 2, Sáb 09:30: 1, Sáb 10:00: 1, Sáb 10:30: 1, Sáb 14:00: 1, Sáb 14:30: 1

#### apertura solo AUX ON · franco y medio corridos ON
| métrica | anterior (31 h) | nuevo (32 h) |
|---|---|---|
| horas PART totales | 155 | 160 |
| cobertura | 98.65 % | 99.01 % |
| horas-caja faltantes | 5.5 | 4 |
| horas-caja sobrantes | 1 | 0.5 |
| horas AUX en caja / eventuales en caja | 31 / 23.5 | 28 / 22.5 |
| tiempo de cálculo | 84 ms | 69 ms |
- Franjas que mejoran: Sáb 09:00 (2→1), Sáb 14:00 (1→0), Sáb 14:30 (1→0)
- Franjas que empeoran: ninguna
- Faltantes que permanecen: Vie 08:00: 1, Sáb 08:00: 1, Vie 08:30: 1, Sáb 08:30: 1, Sáb 09:00: 1, Sáb 09:30: 1, Sáb 10:00: 1, Sáb 10:30: 1

#### apertura solo AUX OFF · franco y medio corridos OFF
| métrica | anterior (31 h) | nuevo (32 h) |
|---|---|---|
| horas PART totales | 155 | 160 |
| cobertura | 99.14 % | 99.51 % |
| horas-caja faltantes | 3.5 | 2 |
| horas-caja sobrantes | 0 | 0.5 |
| horas AUX en caja / eventuales en caja | 28 / 27.5 | 29.5 / 23 |
| tiempo de cálculo | 65 ms | 63 ms |
- Franjas que mejoran: Sáb 09:00 (1→0), Sáb 09:30 (1→0), Sáb 14:00 (1→0), Sáb 14:30 (1→0)
- Franjas que empeoran: Lun 14:30 (0→1)
- Faltantes que permanecen: Vie 08:00: 1, Vie 08:30: 1, Sáb 10:00: 1, Lun 14:30: 1

#### apertura solo AUX OFF · franco y medio corridos ON
| métrica | anterior (31 h) | nuevo (32 h) |
|---|---|---|
| horas PART totales | 155 | 160 |
| cobertura | 98.89 % | 98.89 % |
| horas-caja faltantes | 4.5 | 4.5 |
| horas-caja sobrantes | 0.5 | 0.5 |
| horas AUX en caja / eventuales en caja | 27 / 28 | 25 / 25 |
| tiempo de cálculo | 72 ms | 69 ms |
- Franjas que mejoran: ninguna
- Franjas que empeoran: ninguna
- Faltantes que permanecen: Sáb 08:00: 1, Sáb 08:30: 1, Sáb 09:00: 1, Sáb 09:30: 1, Sáb 10:00: 1, Sáb 10:30: 1, Vie 12:00: 1, Lun 14:00: 1, Lun 14:30: 1

**Lectura:**
- Se recuperan **5 h PART** (1 h por persona) en todas las configuraciones.
- La cobertura **mejora** en 2 configuraciones (98,65 → 99,01 % y 99,14 → 99,51 %) y **se mantiene** en las otras 2. No empeora en ninguna.
- Las horas recuperadas reemplazan horas de AUX y eventuales en caja.
- Con apertura OFF y franco y medio OFF, una franja (lun 14:30) pasa de 0 a 1 faltante, mientras se eliminan 4 faltantes del sábado: el total baja de 3,5 a 2 h.
- Con apertura ON, los faltantes de 08:00 del viernes y el sábado (demanda 2) son estructurales: la regla admite exactamente 1 AUX en la apertura.

### Riesgos y pendientes
- **Validación jurídica:** 32 h es requisito de producto y configuración de la sucursal; la validación jurídica/contractual está pendiente (AH2-004/AH2-014).
- **Fichas reales:** las fichas PART faltantes o en 0 dejarán la semana en BORRADOR (`DATOS_HORAS_FICHA`) hasta completarlas. Revisar las fichas reales antes de publicar. Si una ficha supera 32 h, se planifica con 32 y se avisa.
- **Prioridad de horas (AH2-020, B conjunta):** el multi-arranque es una heurística. Mejora sin regresiones frente al respaldo, pero no garantiza el óptimo: quedan casos «no encontrados» (escenario 100). Para certificarlos hace falta CP-SAT (#13).
- **Costo de cálculo:** la generación pasa de unos 0,05 s a 0,3–0,6 s en dotaciones chicas y unos 2 s con 55 personas. Corre en el hilo del navegador (bloquea la UI durante ese tiempo). Presupuesto de 20 s con respaldo garantizado.
- **Determinismo:** el resultado depende de presupuestos de tiempo (6 s en la pasada 1, 20 s en el multi-arranque). En máquinas muy lentas podrían omitirse estrategias; se informa en `multiArranque.omitidas`.
- **UI:** la estrategia elegida se persiste (`generacion`), pero todavía no se muestra en pantalla.
- **Bloqueo de interfaz:** entre 0,5 y 3 s en la 091 y hasta unos 21 s con 55 cajeros en equipos lentos. Ver la propuesta de Web Worker.
- **Semanas guardadas antes de este PR:** se validan con el perfil histórico de 31 h, que es el correcto para ellas. Una edición manual que las lleve a 32 h se marcará como `NORM_HORAS_MAX`: hay que regenerarlas como versión nueva.
- **Datos:** sin migraciones ni escrituras en Supabase; los campos nuevos viajan en el jsonb existente.

### Próxima tarea exacta
**AH2-020 «B conjunta» implementada en PR #45 (borrador).** Pendiente del propietario:
1. Revisar los resultados y riesgos. Merge, deploy, migraciones y Supabase siguen **no autorizados**.
2. Decidir si se ejecuta el benchmark CP-SAT (#13) según `docs/proposals/AH2-020_BENCHMARK_CPSAT_ISSUE13.md` (offline; requiere Python y OR-Tools en un entorno de análisis).
3. Decidir si se autoriza el PR separado de **Web Worker** (`docs/proposals/AH2-020_WEB_WORKER_GENERACION.md`) y si se cambia el corte por tiempo por un corte por trabajo (afecta la reproducibilidad entre equipos).
4. Opcional: mostrar en Nueva Semana y en Último Horario la estrategia elegida y la mejora (ya persistidas en `generacion`).

**No avanzar al tramo B sin nueva autorización.** Después, el tramo B:

#### Tramo B (Issue #44 / #12)
Diseñar e implementar sin migración el modelo de **ciclo de planificación y publicación**:
- `cicloPlanificacionId`, `vigenteDesde`/`vigenteHasta` y estado `BORRADOR → APROBADO → PUBLICADO`, dentro del jsonb de la semana;
- detección de la semana vigente sin contar versiones repetidas;
- tests de caracterización de 4 y 5 semanas por ciclo.

Antes de implementar, proponer el formato en MASTER §9 como PROPUESTO.

### Para retomar (Claude u OpenAI)
1. `git fetch origin && git checkout feat/ah2-part-horas-contrato`
2. `npm ci && npx tsc --noEmit -p . && npx vitest run && npm run build && PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chromium> npx playwright test --trace off`
3. Revisar el PR borrador de la rama. No fusionar ni publicar sin autorización expresa del propietario.

## Publicación — #41 PDF operativo (caja / presencia) · 2026-11-14

- **Publicado** con autorización del propietario.
  - SHA autorizado: `864ed30`.
  - Merge en `main`: **`c8d6fa8c469528835fe82d63a1b1c92e9c930522`** (base `d57227b`).
- **Deploys de producción:**

  | Sitio | Nuevo (commit `c8d6fa8`, estado ready) | Anterior (commit `f0fcdc2`) |
  |---|---|---|
  | al-iada | `6af893ecdb95b54e626df2f7` | `6af869b146e8e683320974d3` |
  | prestify | `6af893ec4d673cd2e30bef07` | `6af869b1e0d88f43fb9e77a5` |

- **Rollback verificado:** [PR #42](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/42), en borrador, que revierte `c8d6fa8`.
  - El árbol resultante (`855a32c`) es idéntico al de `d57227b`.
  - Sus deploy previews compilaron en al-iada y prestify.
  - Si se fusiona, Netlify reconstruye producción desde `main`.
  - **No fusionar salvo regresión crítica.** No fue necesario usarlo.
- **Preflight:**
  - SHA, base y checks (`test-build`, `browser`, previews) en verde.
  - El diff solo toca el PDF, dos páginas (parámetro `presencia`), pruebas y documentación.
  - Sin migraciones y sin cambios en `netlify/`.
- **Verificación posterior:**
  - Los dos sitios sirven el bundle nuevo: tienen los títulos «HORARIOS DE CAJA» y «HORARIOS DE PRESENCIA — PERSONAL DE APOYO», y ya no tienen «Asignaciones en caja» ni «Horarios Semanales».
  - Funciones de pago:
    - `create-payment` y `webhook-mp` tienen los mismos digests que antes (`3cf2a63e…` y `45dfe6a4…`).
    - Responden OPTIONS 200 y GET 405, sin ejecutar transacciones.
  - Smoke de navegador sin errores de consola y sin escrituras.
  - Sobre `c8d6fa8`:
    - TypeScript y build: OK.
    - Vitest: 300 aprobadas y 2 omitidas.
    - Playwright: 11/11.
    - 8 PDF de QA en A4 horizontal, inspeccionados visualmente.
- **Supabase:**
  - Antes y después: mismos conteos y mismo hash en las 5 tablas (colaboradores 16, reglas 3, semanas 13, correcciones 37, aprendizajes 0).
  - Las 12 semanas previas conservan el hash `ebaee487…`.
  - La fila 13 es la semana 16–22/11 v4, generada por el propietario a las 14:30 después de #39. Incluye `configOperativa` y `disponibilidadSemana`, así que su PDF muestra la presencia registrada.
  - No hubo escrituras ni migraciones.

## Retoma — rediseño operativo del PDF (caja / presencia) · 2026-11-14

- **Rama:** `feat/ah2-pdf-caja-presencia`, desde `main@d57227b`. PR en borrador. Sin merge ni publicación hasta la autorización del propietario.
- **Diseño anterior:**
  - El cuadro «Horarios Semanales» mezclaba la caja de FULL/PART con la *presencia* de los AUX (p. ej. 49 h de un AUX que solo está 9,5 h en caja).
  - Había además una tabla aparte, «Asignaciones en caja», para AUX y eventuales.
  - Total: 6 páginas para la semana 47 anonimizada.
- **Diseño nuevo:**
  1. **HORARIOS DE CAJA:**
     - Incluye FULL, PART, AUX y EVENTUAL juntos.
     - FULL/PART muestran sus jornadas efectivas.
     - AUX y EVENTUAL muestran solo `cajaAux` y `cajaEventual`.
     - Las celdas dicen «Sin caja» o «FRANCO» según corresponda.
     - «Horas caja» se calcula sumando las franjas efectivas.
  2. **HORARIOS DE PRESENCIA — PERSONAL DE APOYO:**
     - AUX: su jornada de presencia, con ediciones.
     - EVENTUAL: la disponibilidad registrada con la semana (`disponibilidadSemana`).
     - Si falta la disponibilidad: «Presencia no registrada». Nunca se reconstruye desde la caja ni desde la disponibilidad actual.
  - Se eliminó la tabla «Asignaciones en caja».
  - Cobertura, validación y alertas se conservan.
  - El PDF de la semana 47 pasa a 4 páginas: interlineado más compacto en las tablas semanales y la cobertura entra en una sola página.
- **Alcance:**
  - Cambia solo la presentación: `src/utils/exportPDF.ts` y el pasaje de `presencia` desde Nueva Semana y Último Horario.
  - No cambian el motor, las reglas, la cobertura ni su umbral, Supabase, los datos guardados ni Prestify.
- **Pruebas:**
  - TypeScript y build: OK.
  - Vitest: 300 aprobadas, 2 omitidas.
  - Playwright: 11/11.
  - Nuevo `pdfCajaPresencia.test.ts` (10 casos) con geometría de márgenes y superposición en cada página.
  - `exportPDFRoster` adaptado y verificado con 25, 40 y 60 personas.
  - Evidencia visual en `docs/evidencia/pdf-caja-presencia/`, con datos anonimizados.
- **Próxima acción:** revisión del propietario. Si lo aprueba, autorizar merge y publicación.

## Publicación — #39 motor de asignación corregido · 2026-11-14

- **Publicado en producción** con autorización expresa del propietario.
  - SHA autorizado: `7258d7d`.
  - Merge commit en `main`: **`f0fcdc2861b4b896395bb04da674359ebb6bfaa8`** (base `59e751e`).
- **Deploys de producción:**

  | Sitio | Nuevo (commit `f0fcdc2`, estado ready) | Anterior (rollback, commit `59e751e`) |
  |---|---|---|
  | al-iada | `6af869b146e8e683320974d3` | `6af787ded7f28c7e2a47dd5f` |
  | prestify | `6af869b1e0d88f43fb9e77a5` | `6af787de1dbac72c8383dd5f` |

- **Rollback:**
  - Los deploys anteriores siguen servidos: sus permalinks responden 200.
  - Vía que puede ejecutar el agente: revert del merge `f0fcdc2` en `main`. Netlify reconstruye ambos sitios desde `main` (`branch: main`, `manual_deploy: false`).
  - Vía del propietario: «Publish deploy» del deploy anterior, desde el panel de Netlify.
  - La prueba de restauración por la API de Netlify (re-publicar el deploy vigente) fue bloqueada por el sistema de permisos de la sesión y **no se ejecutó**.
  - No fue necesario hacer rollback.
- **Preflight:**
  - SHA y base coinciden con lo autorizado.
  - Checks `test-build`, `browser` y deploy previews en verde.
  - Sin migraciones ni cambios en `netlify/` (funciones de pago).
- **Verificación posterior:**
  - Los dos sitios sirven el bundle nuevo, con los marcadores del motor y del validador.
  - Rutas de al-iada: responden 200, el login se renderiza, las rutas protegidas piden sesión, sin errores de consola ni escrituras.
  - Prestify:
    - `create-payment` y `webhook-mp` tienen los mismos digests (`3cf2a63e…` y `45dfe6a4…`).
    - Responden OPTIONS 200 y GET 405, sin ejecutar transacciones.
  - Batería completa sobre `f0fcdc2`:
    - TypeScript y build: OK.
    - Vitest: 289 aprobadas y 2 omitidas.
    - Playwright: 11/11 (apertura ON/OFF, AUX, eventuales, edición, H-A2, PDF).
- **Motor publicado con la dotación real de la 091** (lectura de solo lectura, ids seudónimos, en memoria y sin guardar):
  - ON: apertura con 1 AUX / 0 FULL-PART / 0 eventuales los 7 días; sin cobertura duplicada; VALIDADO; cobertura 99,4 %.
  - OFF: abre 1 FULL/PART, sin AUX ni eventuales; VALIDADO.
  - Cero AUX simulado: H-A2 en los 7 días, BORRADOR.
  - Edición en memoria: sin duplicación ni asignaciones fuera de disponibilidad.
- **Supabase** (antes y después, mismos conteos y mismo hash de contenido):

  | Tabla | Filas |
  |---|---|
  | colaboradores | 16 |
  | reglas_configurables | 3 |
  | semanas_historial | 12 |
  | correcciones_manuales | 37 |
  | aprendizajes_derivados | 0 |

  No hubo escrituras ni migraciones, y la semana 47 no se regeneró.
- **Limitación:** no se probó el flujo autenticado en producción porque no hay credenciales y generar una semana escribiría datos. El flujo quedó cubierto por Playwright sobre el mismo commit.
- **Próxima acción (propietario):** en la 091, generar la semana 16–22/11 como versión nueva desde Nueva Semana y revisar el estado VALIDADO/BORRADOR antes de exportar.

## Retoma — #38 corrección del motor de asignación (apertura, AUX, eventuales) · 2026-11-14

- **Rama:** `fix/ah2-38-apertura-aux` desde `main@59e751e` (#37). [PR borrador #39](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/39) · [Issue #38](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/38).
- **Commits:**
  - 1.ª entrega: `449d835`.
  - Cierre: SHA registrado en el PR #39.
- **Restricciones respetadas:** sin merge, deploy, migraciones ni escrituras en Supabase. Prestify, `netlify/` y sus funciones de pago no cambian.
- **Causa del 2/1 (semana 16–22/11, v3):**
  - Con apertura ON, la pasada 2 sentaba al AUX pero no descontaba su cobertura del déficit.
  - La pasada 3 cubría la apertura con el eventual disponible desde las 06:00.
  - El validador no revisaba la composición de la apertura.
- **Decisiones del propietario aplicadas (PR #39):**
  - R3 es presencia y supervisión continua, no caja continua.
  - AUX en caja solo con déficit real, salvo la apertura obligatoria con ON. Se admiten bloques de 30 min.
  - Con OFF abre un FULL/PART dentro de su contrato; no se modifica el catálogo laboral.
  - Las semanas históricas se preservan. Si faltan datos, su estado es «SIN VERIFICAR», nunca VALIDADO.
- **Motor:**
  - Pasada 1: default ON. Con OFF prioriza abrir con FULL/PART (cortadas FULL del catálogo vigente).
  - Pasada 2: AUX en caja solo con déficit, dejando ≥1 parado. ON = exactamente 1 AUX descontado; OFF = ningún AUX. Los huecos se informan sin anular la semana.
  - Pasada 3: solo el déficit residual, nunca la apertura.
- **Apertura configurable de punta a punta:**
  - El diagnóstico previo (`diagnosticarSupervision`), la validación (H-A1), la generación, la edición y el PDF usan el estado efectivo. Con OFF no hay H-A1.
  - Si con OFF no hay un cajero compatible, se informa «ningún cajero FULL/PART abre dentro de su contrato», sin sustituirlo.
- **Recálculo integral tras una edición (`recalculoSemana.ts` + `aplicarEdicionConRecalculo`):**
  - Cualquier edición de cajero, AUX o eventual re-ejecuta las pasadas 2 y 3 con la configuración y la disponibilidad guardadas, y actualiza cobertura, faltantes y %.
  - Las celdas de eventuales editadas a mano quedan fijadas (`eventualesFijos`): no se pisan y se descuentan antes de recalcular.
  - Los conflictos no resolubles quedan como BORRADOR con su causa: cobertura duplicada, apertura y disponibilidad.
  - Si no hay disponibilidad guardada, los eventuales no se reasignan y se avisa.
- **Reglas:** `resolverReglaOperativa` es determinística: vigencia acotada, luego la más reciente, con conflicto informado. Nueva Semana muestra el estado efectivo.
- **Validador:** bloquea con los códigos:
  - `OP_APERTURA_COMPOSICION`
  - `OP_CATEGORIA`
  - `OP_AUX_FUERA_PRESENCIA`
  - `OP_EVENTUAL_FUERA_DISPONIBILIDAD`
  - `OP_AUX_CIERRE`
  - `H-A2`
  - `OP_SUPERVISOR_JORNADA`
  - `OP_COBERTURA_DUPLICADA`

  Además informa `limitaciones`, que impiden VALIDADO; el PDF las lista como `SIN_VERIFICAR`.
- **Persistencia sin migración:** el jsonb `horario_completo` guarda `configOperativa`, `disponibilidadSemana` y `eventualesFijos`.
- **Pruebas del cierre:**
  - TypeScript y build: OK.
  - Vitest: 261 aprobadas y 2 omitidas (locales).
  - Playwright: 11/11.
  - Contra el candidato `449d835`: el archivo nuevo de recálculo y apertura OFF da 11/13 rojas, y el recorrido Playwright OFF falla.
  - Contra `main`: las pruebas de la 1.ª entrega dan 23/30 rojas.
  - `npm run lint` sigue sin configuración ESLint (también en la base).
- **Último control (H-A2):**
  - El validador ya no condiciona H-A2 a que exista presencia de AUX. Con cero AUX, cada día da H-A2 («no hay ningún supervisor (AUX) disponible») y BORRADOR, con cualquier valor de «apertura solo AUX».
  - Diagnóstico previo, motor, validación final, edición y PDF coinciden en los días con H-A2.
  - `supervisionHA2.test.ts` cubre 4 escenarios × ON/OFF: cero AUX, AUX solo en la apertura, AUX solo por la tarde y supervisión completa. También cubre la edición y el PDF.
  - Contra `8931bbd` fallan los 5 casos de cero AUX.
- **Pruebas del candidato final:**
  - TypeScript y build: OK.
  - Vitest: 289 aprobadas y 2 omitidas.
  - Playwright: 11/11.
- **Próxima acción:** autorización de publicación del propietario. Tras publicar, regenerar en la 091 la semana 16–22/11 como versión nueva, sin modificar las guardadas.

## Retoma — corrección de la operación real de la 091 · 2026-11-13

- Base publicada `0460b706cf2b9f51dcf71c4d79db1dcb482fb882`, rama `fix/ah2-operacion-real`, [Issue #36](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/36). El PR de la rama registra el SHA exacto del candidato.
- PDF semanal en Nueva Semana y Último Horario. AutoTable ahora mide y dibuja con el mismo interlineado ampliado, reserva margen para encabezado/pie y pagina las filas. El caso guardado de la 091, leído sin escrituras y con nombres sustituidos, pasó de 66 cruces de cajas de texto a 0 en 5 páginas renderizadas. El repositorio contiene solo fixtures sintéticos. El PDF de Historial sigue siendo el resumen de versiones.
- Alta AUX mediante formulario con foco, nombre completo y objetivo opcional. Cambios de la misma ficha se escriben en orden. Las celdas de AUX/eventuales crecen al escribir y la grilla nominal muestra un bloque por línea. Parser común para disponibilidad, excepciones, edición manual y franja de reglas. Se conserva el formato histórico en almacenamiento y se mantienen las medias horas del motor.
- Horas por fila calculadas a partir de bloques sin solaparlos ni contar francos. El objetivo FULL/PART viene de la ficha. Para AUX se mide presencia y para eventuales hay máximo opcional con aviso preventivo sobre 48 h. El campo existente `horas_semanales` guarda los valores opcionales. Los excesos configurados entran en la revisión final, sin cambiar el optimizador.
- Pruebas locales: instalación limpia, TypeScript, build, Vitest 218/218 con POM y semana locales, Playwright 10/10 incluida recarga y reingreso con backend simulado. `npm run lint` falla también en la base por falta de configuración ESLint.
- El candidato está para revisión en borrador. Próxima acción: revisar CI y evidencia visual, y probar una impresión al 100% y el reingreso en la cuenta 091 tras una publicación autorizada. Sin merge, deploy ni escrituras en Supabase.

## Registro histórico — preparación del piloto 091 · 2026-11-13

- **Rama de tarea:** `fix/ah2-desbloqueo-piloto`, desde `bb8753fa7f5d78e39af10a15040fa09dfc02e669`. El SHA definitivo del release y sus checks se registran en el [PR #30](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/30). La Entrega 1 en producción corresponde a `main@8aa104db17f87250661d7e2348af1190e9806759`.
- **PDF:** se aplica la opción recomendada por PDF.js al abrir archivos en el navegador y en el lector Node que usa la validación local. Pruebas de regresión en `pdfSeguridad.test.ts`. La deuda de actualización queda en [Seguridad PDF y padrón](SEGURIDAD_ENTREGA2.md).
- **Colaboradores:** `cargarGrupoRoster` solo consulta el grupo autenticado, incluso vacío. Los hooks separan el modo local del roster de la cuenta y avisan si falla la consulta. Se retiró de Colaboradores la restauración de AUX de prueba, se corrigió el aviso de login y los ejemplos quedaron en los fixtures de Playwright. La decisión de importación queda en MASTER §9, AH2-013.
- **Regresión local:** Vitest 197/197 con el POM original. La semana 16–22/11 conserva 31 franjas × 7 días, 217 valores, 406 horas-caja y un pico de 7. La suite incluye tests de cuenta vacía, con roster existente, con grupos parciales y con fallo de lectura. Playwright cubre la pantalla vacía y un alta local explícita tras recargar, además de POM → generación → validación → PDF A4 reabierto. La comprobación del POM original es local y el archivo queda fuera de Git.
- **Supabase y Prestify:** sin escrituras ni migraciones. El release no cambia configuración de Netlify ni las funciones `create-payment` y `webhook-mp` frente a `main`. La [auditoría SEC-02](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/5#issuecomment-6839785095) verificó RLS y el rechazo de lecturas anónimas. El merge de #30 dispara producción en ambos sitios.
- **Próxima acción:** con el nuevo SHA validado, verificar acceso de publicación para [al-iada](https://app.netlify.com/projects/al-iada/deploys/6af6266feb1a7e267dfa1aa8) y [prestify](https://app.netlify.com/projects/prestify/deploys/6af6266f137817f4541290c9). Conservar #30 en borrador hasta autorización expresa del propietario. La primera validación con la dotación vigente la dirige el propietario.

## Registro histórico — Entrega 2 consolidada — ChatGPT Work, 2026-11-12

- **Estado:** #32 (PDF A4) y #33 (AUX/eventuales) fusionados exclusivamente en `release/ah2-f1`. Merge #32 `1b770d2ed0b66eec9432c4da764aa39258bbcfbe`. Merge #33 y candidato funcional verificado `195276af0361222824a25d2fa7d156a8289c5be7`. El SHA posterior que incorpora este informe se registra en el [PR #30](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/30).
- **PR #30:** sigue en borrador y pendiente de autorización del propietario. `main` = `8aa104db17f87250661d7e2348af1190e9806759`.
- **Archivos y alcance:** 21 archivos del conjunto #32/#33, incluidos la pantalla Nueva Semana, el generador PDF, disponibilidad, validador y pruebas. La consolidación conservó los dos cambios en los archivos compartidos. Este cierre incorpora únicamente este registro y [el informe de aceptación](ACEPTACION_ENTREGA2.md).
- **Pruebas sobre el código integrado:** Node 22.23.5, `npm ci --no-audit --no-fund` (347 paquetes), `npm test` (189 aprobadas y 1 omitida, POM real), `npx tsc --noEmit`, `npm run build` y Playwright 4/4 sobre el build. `test-build` y `browser` en verde en GitHub. PDF sintético → 31 franjas y 406 horas-caja → horario → validación → PDF A4 reabierto.
- **Regresión de horarios vs `1165027`:** motor idéntico en 4 escenarios sintéticos. Turnos de cajeros/eventuales, caja y cobertura coincidentes. En el escenario con hueco, el único cambio de la salida nominal es que conserva la presencia de los AUX; no los asigna a caja.
- **Pendientes de producción:** prueba local con POM real y dotación vigente, decisiones laborales y operativas D1–D4 y AUX-D1–D4, y decisión del propietario sobre el alcance de la publicación. Siguen abiertas la publicación oficial persistida, persistencia de excepciones y las tareas #5/#23. Detalle y evidencia en el informe.
- **Supabase / despliegue:** sin consultas, escrituras, migraciones ni despliegue productivo. Se probó en local con datos sintéticos.
- **Próxima acción:** validar en local el POM representativo con `POM_PDF="/ruta/al/archivo.pdf" npx vitest run pom-real.local`, revisar el informe y registrar la decisión del propietario en el PR #30.

## Registro histórico de retoma — implementación previa a la integración de Entrega 2 — 2026-11-12

- **GitHub verificado:** `main` = `8aa104db17f87250661d7e2348af1190e9806759` (Entrega 1, #31); `release/ah2-f1` = `11650278b09037054dcbd2432bab47ce685c27e0` (PR #30 abierto en borrador, sin autorización de merge y con `test-build` exitoso).
- **Rama de revisión:** `feat/ah2-aux01-excepciones-ui` (#28), basada en el SHA verificado del release. La rama independiente `fix/ah2-pub01-pdf-a4` (#12) tiene la mejora de impresión. Borradores [#33](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/33) y [#32](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/32). Cada PR enlaza su HEAD y sus checks.
- **#28:** `DisponibilidadSemana.tsx`, `NuevaSemanaPage.tsx` y `ColaboradoresPage.tsx` distinguen patrón y excepción con fecha, motivo y autor. Se usa el módulo habitual en la generación, con corrección de errores cruzados entre roles y detección de horarios inválidos o contradictorios. Los huecos H-A1/H-A2 se muestran antes de generar y dejan el resultado como BORRADOR. El adapter conserva la presencia nominal de AUX aunque el motor descarte su asignación en caja. La excepción vive en memoria de la pantalla, no altera el patrón y se pierde al salir o recargar.
- **Recorrido integrado:** `main.tsx` sirve el worker de PDF desde la app y `PreviewNecesidad.tsx` informa horas-caja de medias horas. `e2e/nueva-semana.e2e.ts` ejecuta POM sintético de tres páginas → 31 franjas y 406 horas-caja → horario nominal → validación → PDF reabierto. Incluye flujo habitual, excepción eventual, huecos de AUX, inconsistencia, retiro y recarga. `playwright.config.ts` desactiva Supabase y los tests rechazan tráfico externo. El PR incluye el job de navegador y la relectura del PDF usa el export por defecto de pdf.js para compatibilidad con Node 22.
- **Pruebas de los dos cambios combinados:** instalación limpia con `npm ci --no-audit --no-fund`, Vitest **189 aprobadas y 1 omitida** (requiere el POM real), TypeScript y build correctos, Playwright **4/4** en Chromium headless. Los cuatro recorridos usan solo datos sintéticos.
- **Límites:** quedan pendientes la persistencia de excepciones y los estados formales de publicación (#12 y #28), la planificación automática de presencia AUX y las decisiones AUX-D1–D4, D1–D4 del motor y los pendientes de seguridad D5/#5 y #23 ya documentados. El propietario informó que eliminó las claves de Anthropic. El antecedente de abajo es histórico; la generación y sus pruebas no requieren credenciales.
- **Datos:** ninguna consulta ni escritura en Supabase, migración, fusión o publicación de producción. Pruebas con dotación y POM sintéticos. La comprobación del formato del POM real sigue pendiente y se hace localmente, sin publicar el archivo.
- **Siguiente acción:** revisar los dos PR contra el release y sus checks; tras autorizar su integración, repetir `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build` y `npm run test:e2e` sobre el nuevo SHA del PR #30 y validar un POM representativo localmente. El merge del PR #30 y su publicación requieren autorización propia.

## Registro histórico de retoma — después de la ENTREGA 1 — Claude, 2026-11-12

Estado al cierre de la Entrega 1.

### Entrega 1 — EJECUTADA y verificada (2026-11-12, autorización: PR #31, comentario 6835443386)
- **`main` = `8aa104db17f87250661d7e2348af1190e9806759`**: merge commit del PR #31 (padres `9909e87` y `acb2ba8`). Rama `release/ah2-f1-entrega1` conservada.
- **Producción:**

  | Sitio | Deploy | Commit |
  |---|---|---|
  | `al-iada` | `6af6266feb1a7e267dfa1aa8` | `8aa104d` |
  | `prestify` | `6af6266f137817f4541290c9` | `8aa104d` |

  Ambos en estado ready, con 1 regla de redirect procesada.
- **Rollback disponible:**
  - al-iada `6af5ff7184f60b0849ef3c79`
  - prestify `6af5ff713eac55707eeb3c28`

  Procedimiento: `docs/PUBLICACION_ENTREGA1.md` §6. **No hizo falta usarlo.**
- **Verificado en producción:**
  - proxy `SEGURO` en ambos sitios (OPTIONS 204 sin CORS, GET 405, POST 503);
  - `/`, `/nueva-semana`, `/colaboradores`, `/reglas`, `/historial` → 200;
  - bundle sin nombres anteriores, sin SDK de IA y sin patrón de clave;
  - funciones de pago sin cambios (GET 405, igual que antes);
  - UI carga en ambos sitios sin errores JS.
- **Credenciales:** eliminadas de ambos sitios las variables `CLAUDE_API_KEY`, `VITE_CLAUDE_API_KEY`, `VITE_ANTHROPIC_API_KEY` y `ANTHROPIC_API_KEY`, antes del build. No se leyó ni registró ningún valor.
- **⚠️ Riesgo residual (conflicto abierto):**
  - La **revocación o rotación en Anthropic no se hizo**: no hay acceso a esa consola desde las herramientas de desarrollo, y desde Netlify no se puede saber si la clave se usa en otros sistemas.
  - Los **permalinks de deploys anteriores** (por ejemplo `6af5ff71…--al-iada.netlify.app`) siguen sirviendo el proxy viejo, con la variable que tenían al desplegarse.
  - Contención intentada: protección de deploys no productivos en Netlify. Respuesta 422: no disponible.
  - **Acción del propietario:** en la consola de Anthropic, revisar el uso de la clave; si no la usa otro sistema, revocarla; si la usa, rotarla y actualizar ese sistema.

### Release candidato (PR #30) — PENDIENTE de autorización propia
- **Rama de release `release/ah2-f1`:** combina, sobre `main` y en este orden: #16 → #15 → #26 → #27 → #25 → #17 → #18 → #19 → #20 → #21 → #22 → #29. Conflictos resueltos:
  - `docs/CURRENT_WORK.md`: reordenado en este archivo;
  - `src/pages/NuevaSemanaPage.tsx` entre #17 y #21: se conservan los dos bloques de estado;
  - registro AH2 del MASTER: reordenado.
  
  Evidencia de pruebas: en el PR de la rama de release y en la épica #3.
- **#24** es solo demostración (*deploy preview*). **No es PR de integración.**
- **Entrega 1:** ya integrada en `main` (ver arriba). Rama `release/ah2-f1-entrega1`, prefijo de esta rama (#16, #15, #26, #27, #25 + procedimiento). Procedimiento: [`docs/PUBLICACION_ENTREGA1.md`](PUBLICACION_ENTREGA1.md). Después de la entrega 1, este PR (#30) se integra con «Create a merge commit»; lo que agrega es #17–#22 y #29.
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

### ESTADO — PDF semanal A4 (#12) — ChatGPT Work, 2026-11-12

- **Rama:** `fix/ah2-pub01-pdf-a4` contra `release/ah2-f1` · **base verificada:** `11650278b09037054dcbd2432bab47ce685c27e0`. El SHA de revisión está en el PR vinculado a #12.
- **Cambios:** `src/utils/exportPDF.ts` rediseña la grilla nominal A4 apaisada, con columnas fijas, jornadas cortadas en líneas, francos, tipos y horas semanales. Incluye presencia de AUX y caja de eventuales, más anexos de caja, cobertura, validación y alertas. Repite sucursal, semana, estado disponible, versión existente y encabezados, con numeración de páginas. `NuevaSemanaPage.tsx` y `UltimoHorarioPage.tsx` pasan los metadatos de las semanas correspondientes. Las reimpresiones antiguas usan los datos que tengan guardados.
- **Evidencia:** `exportPDFRoster.test.ts` reabre PDFs sintéticos de **25, 40 y 60** con pdf.js y comprueba cada nombre, tipo, horas y los siete días, incluidos límites de página y anexos. Revisión visual con Poppler de **7, 8 y 13 páginas** respectivamente, con **2, 3 y 4** páginas nominales. El caso de 60 incluye 45 incidencias y 60 alertas sintéticas para probar los cortes.
- **Pendiente #12:** aprobación y publicación persistidas, bloqueo formal y trazabilidad de la versión con hash del POM, perfil y reglas. Requieren la decisión y autorización correspondientes. Supabase, migraciones, producción y datos operativos quedaron fuera del trabajo.

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
