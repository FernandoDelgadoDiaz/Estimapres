# CURRENT WORK — ALIADA HORARIOS 2.0

## PUNTO ÚNICO DE RETOMA — cobertura de cierre FULL/PART · 2026-11-17

- Rama `feat/ah2-cobertura-cierre`, base de `main` verificada `a7006e48476226976d8b698881ac5274eb568a7d` (#51).
- V9 (planificación experimental de 091, semana 16–22/11): su PDF dice VALIDADO. La grilla exportada contiene 31 franjas, 406 h-caja, 12 faltantes y 0 sobrantes: 97,04 %. La última media hora tiene una caja faltante los siete días (3,5 h-caja). El PDF no certifica el snapshot de generación ni el domingo anterior efectivo. Faltan acreditar fichas vigentes, disponibilidades de entrada, excepciones, reglas, sesgos y pesos e historial original. V8/V9 tampoco acreditan turnos trabajados.
- Causa demostrada en el código previo: pasada 1 calcula utilidad contra demanda bruta y su propia cobertura. Pasadas 2/3 conocen disponibilidad y cortes, pero no retroalimentan la planificación FULL/PART. El selector previo mira déficit total y sobrantes, sin objetivo específico de cierre. Causa del resultado V9 sin aislar hasta reproducir su entrada.
- Refinamiento: al finalizar la búsqueda normal, con un corte configurado y déficit posterior al corte, se exploran desplazamientos de 30 minutos del último bloque FULL/PART, con los catálogos y excepciones de la pasada 1. Cada propuesta vuelve a ejecutar AUX y eventuales con demanda y reglas intactas. Se exige validación independiente, mismas horas por persona, objetivo PART exacto si existe, ningún aumento de déficit en ninguna franja ni de sobrantes semanales y mejora efectiva de cierre. Se conservan categoría de mañana, días de franco y composición. Se conserva el resultado normal si no hay mejora y se respeta el presupuesto del multi-arranque.
- Archivos de motor: `src/algoritmo/{pasada1-fullpart,orquestador}.ts` y `src/utils/generacionMultiArranque.ts`. Pruebas y benchmark reproducible: `src/algoritmo/__tests__/cobertura-cierre.test.ts`. Sin cambios de configuración, Prestify, BD, producción o reglas de 091.

### Comparación A/B controlada

Fixture sintético existente (no equivale a V9), demanda 406 h-caja, 4 FULL de 48 h, 5 PART de 32 h, 3 AUX, 3 eventuales, máximo dos bloques de caja por eventual y corte 22:00. Domingo anterior sintético con fin a las 20:00; una prueba separada verifica el rechazo con descanso insuficiente. A omite exclusivamente el nuevo refinamiento. B lo ejecuta sobre la misma entrada.

| Indicador | A | B |
|---|---:|---:|
| Cobertura | 98,03 % | 98,15 % |
| Faltantes h-caja | 8 | 7,5 |
| Sobrantes h-caja | 2 | 2 |
| Faltante 22:00–22:30 (h-caja) | 2,5 | 2 |
| Picos diarios (82,5 h-caja) | 100 % | 100 % |
| Infracciones del validador | 0 | 0 |
| Mediana en Node (cinco pares alternados) | 335 ms | 364 ms |

Refinamiento p50: 63 ms. Tiempos de una máquina, con preparación previa, sin extrapolar a producción. Ambos resultados conservaron objetivo individual, descansos y francos en el fixture, límite de bloques, ausencia de AUX/eventuales en caja al cierre y consistencia entre cobertura, validación y PDF. Las franjas de 19:00–21:00 quedaron sin faltantes en ambos.

Faltantes en cajas por día y media hora. Valor único significa A = B; franjas omitidas tienen cero en ambas.

| Desde | Lun | Mar | Mié | Jue | Vie | Sáb | Dom |
|---|---:|---:|---:|---:|---:|---:|---:|
| 08:00 | 0 | 0 | 0 | 0 | 1 | 1 | 0 |
| 08:30 | 0 | 0 | 0 | 0 | 1 | 1 | 0 |
| 09:00 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| 09:30 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 10:00 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 10:30 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 14:00 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 14:30 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| 22:00 | 0 | 1 | 0 | 0 | 1 → 0 | 2 | 1 |

Reproducir en Node mediante `AH2_CIERRE_RESULTADOS=/tmp/cierre.json npm test -- src/algoritmo/__tests__/cobertura-cierre.test.ts`. TypeScript y build local aprobados. Vitest local: 451 aprobadas, 4 omitidas. Chromium local abortó al crear un socket de proceso; consultar el check browser del PR.

Siguiente paso: validar A/B con el snapshot privado exacto V9 o con un snapshot de la próxima semana y su domingo anterior real, sin guardar semanas. Mantener el motor productivo mientras no se confirme el impacto en 091.

## Registro anterior — límites de caja de eventuales · 2026-11-16

- Rama `feat/ah2-reglas-caja-eventuales`, base verificada `3b74d9c3102124abf8c6f77d45154ee2f76ae786`. El historial anterior queda debajo.
- Implementación en la pasada 3, adaptación de entrada, gestión y revisiones por sucursal, snapshot semanal, recálculo tras edición y validador independiente. Sin valores por defecto para ambas reglas. Una edición manual incompatible queda informada por la validación. Cambios y pruebas en el diff de la rama.
- AUX favorece continuidad y luego equidad en horas acumuladas. No hay máximo diario de bloques en esa pasada. Falta confirmación del alcance de POM para AUX. No cambió la pasada 2.
- La comparación preliminar con FULL/PART/AUX fijos reporta A y B 97,54 % / 10 h faltantes, C y D 96,80 % / 13 h faltantes. Son cifras informadas de una simulación parcial.
- Benchmark real completo pendiente. Se localizaron el PDF de horarios y el documento de programación semanal, pero los documentos no acreditan el snapshot v8. Falta verificar dotación y fichas vigentes al generar, disponibilidades resueltas, excepciones, preferencias y pesos, reglas efectivas, matriz original y horarios del domingo anterior. No cargar datos personales en GitHub ni en CI.
- Próximo paso: recuperar el snapshot v8 por un canal privado, verificar que A reproduzca la referencia original, ejecutar B/C/D con la misma entrada y las tres pasadas usando el multi-arranque vigente. Registrar estrategias y omisiones por tiempo, déficit y sobrantes por franja, picos, bloques de caja, asignaciones desde el corte, cumplimiento contractual, infracciones y tiempos. Si falta el domingo anterior, marcar el descanso intersemanal sin verificar.
- [PR #51](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/51), en borrador. Candidato inicial `9cdba032d49be9887ca5e5a7ce2573f1e83de0f5`: [CI 62](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43981623042) pasó 448 tests Vitest (3 omitidos). TypeScript detectó una clave demasiado amplia en el compilador de toggles V2; se corrigió en el siguiente commit. Los checks del HEAD del PR son la referencia vigente. Sin cambios de main, Prestify, Netlify, datos operativos o migraciones.

### Ejecutar la comparación real en privado

Conservar el JSON de entrada y el informe fuera del repositorio. El JSON debe contener `sucursal`, `version`, `fechaLunes`, `cajeros`, `auxiliares`, `eventuales`, `opciones` y `contexto`. Usar los argumentos originales del generador (dotación activa, disponibilidad ya resuelta, opciones con sesgos/pesos y contexto con POM, reglas efectivas, excepciones y semana anterior). Una exportación posterior a la generación solo es válida si esos valores coinciden con los de v8.

```powershell
$env:AH2_091_SNAPSHOT = 'C:\\datos-privados\\aliada-091-v8.json'
$env:AH2_091_RESULTADOS = 'C:\\datos-privados\\aliada-091-benchmark.json'
npx vitest run src/algoritmo/__tests__/benchmark/cajaEventual091.bench.test.ts
```

El informe incluye huella del JSON, cuatro corridas completas y comparación con la referencia de A. Los picos son las franjas de demanda máxima de cada día. Las franjas registran horas-caja faltantes en intervalos de media hora. Los tiempos reflejan la ejecución real y el informe indica las estrategias omitidas por presupuesto.

## Registro anterior — simulación conjunta de #46, #47 y #48 · 2026-11-16

### Estado y evidencia

Rama local aislada `audit/ah2-integration-46-47-48`. La auditoría conserva las ramas remotas y los deploys vigentes. Leer el [MASTER](ALIADA_HORARIOS_MASTER.md), el [diseño B](AH2_TRAMO_B_DISENO.md) y la [propuesta P2](proposals/AH2_P2_RPC_PUBLICACION_SEGURA.md). Los apartados posteriores son históricos.

| Entrada | SHA verificado | Estado |
|---|---|---|
| `main` | `905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea` | Base y producción de ambos sitios |
| [#46](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/46) | `beaa8ab1a7a5d15f733fa1a23152f3266e196fb2` | Borrador. [Actions aprobó test-build y browser](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43804608444) |
| [#47](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/47) | `0499015e7d8a721a851d3322528f0ca07530608c` | Borrador. [Actions aprobó test-build y browser](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43804609800) |
| [#48](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/48) | `db145b7422f9142aad4cd50b9e64ee9b8a8f897b` | Borrador. [Actions aprobó test-build y browser](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43806581600) |

La simulación de #46 y #47 fue limpia. #48 tuvo un conflicto en `docs/CURRENT_WORK.md`. La resolución conserva el historial común una vez, más las secciones propias de Tramo B, B1 y W1. Las ocho combinaciones merge/squash dan el mismo árbol en cada etapa con esa resolución. Los árboles esperados de #46 y #47 son `19178da22095fd239def5c883be99479ab9ed8f0` y `dea4f57e7faa58f19caafc8e170d271b2f5de484`. Para el árbol final ejecutar `git rev-parse audit/ah2-integration-46-47-48^{tree}`. Los SHA de commit creados por GitHub dependen de los metadatos al integrar. Validar el árbol y registrar el SHA real después de cada paso. Los checks enlazados corresponden a los PR individuales. El candidato combinado se probó localmente.

### Pruebas del candidato acumulado

- `npm ci --no-audit --no-fund` en worktree limpio. TypeScript, build de producción sin credenciales y Vitest completos. 440 pruebas aprobadas, 3 omitidas por la suite.
- Playwright Chromium estándar. 15 aprobadas y el benchmark optativo, corrido aparte. Incluye POM → horario → validación → exportar y releer PDF, edición y persistencia del historial al recargar, Worker real, arranque fallido con modo compatible, cancelación, reintento y respuesta tardía, reinicio y navegación.
- Prueba de auditoría adicional sin cambio al repositorio. Cambiar el lunes durante el cálculo terminó el trabajo y descartó el mensaje tardío. Cero filas sintéticas guardadas.
- Benchmark offline de 200 casos sobre `main` y el candidato. Cero diferencias funcionales al excluir tiempos, 98,7563 % de cobertura media y cero violaciones. En Chromium también coincidieron Worker e hilo principal en el fixture sintético 47 y en los 200 casos, incluidas jornadas, cobertura, selección, estado del validador y estrategias omitidas.
- Rendimiento en build de producción. Las 12 combinaciones de 9/20/35/55 cajeros a 1×/4×/6× pasaron, con máximo de 195 ms del hilo principal. Cancelación real a 55/6× en 16 ms y cero guardados. CDP ralentizó el hilo de la página, no la CPU física del Worker.
- WebKit WPE en Linux pasó las dos pruebas de escritorio. El perfil iPhone 13 a 390 px pasó la equivalencia de la semana 47 y, tocando el área visible, la cancelación, el descarte y el reintento. El menú lateral intercepta el centro de «Generar» tanto en el candidato como en `main`. Es una limitación de layout preexistente. Queda el smoke en Safari sobre un iPhone físico.
- `src/planificacion/` conserva el contenido de #47 y no tiene importadores en la aplicación. El `dist/` local acumulado es idéntico byte a byte al de #48 por separado con el mismo entorno. El motor, validador, cortes de 6 s/20 s, contrato, dependencias, funciones de pago y configuración Netlify tienen el mismo contenido que en `main`. P2 sigue documental. La única incidencia cosmética de `git diff --check` frente a `main` es una línea vacía final heredada de #47 en `src/planificacion/diff.ts`.

### Netlify y reversión

Ambos proyectos apuntan a `FernandoDelgadoDiaz/Estimapres` con raíz del repo, builds activos, rama de producción `main`, deploy previews habilitados y publicación automática activa. Un cambio en `main` hace que ambos sitios construyan y publiquen automáticamente si el build termina bien. Prestify muestra comando vacío y directorio `/` en la configuración del panel. Los logs vigentes de los dos sitios muestran que el `netlify.toml` compartido aporta `npm run build`, `dist` y `netlify/functions`. Los dos empaquetan `claude-proxy`, `create-payment` y `webhook-mp`. El código de pago y el lockfile están intactos. Su ejecución depende del entorno de cada sitio y contexto de deploy. Mantener Prestify fijado a su deploy durante una publicación aislada de Aliada protege su proceso de cobro.

| Sitio | Snapshot vigente y objetivo de rollback para esta integración | Versión anterior usada para comprobar el control |
|---|---|---|
| Aliada | [`6af8ee2dae9d7a3ca54d5aef`](https://app.netlify.com/projects/al-iada/deploys/6af8ee2dae9d7a3ca54d5aef) | [`6af893ecdb95b54e626df2f7`](https://app.netlify.com/projects/al-iada/deploys/6af893ecdb95b54e626df2f7) |
| Prestify | [`6af8ee2d15984dc64ecb3e7d`](https://app.netlify.com/projects/prestify/deploys/6af8ee2d15984dc64ecb3e7d) | [`6af893ec4d673cd2e30bef07`](https://app.netlify.com/projects/prestify/deploys/6af893ec4d673cd2e30bef07) |

Los dos snapshots vigentes están `ready` en producción, pertenecen a sitios distintos y sus URLs únicas responden HTTP 200 y entregan el mismo HTML que el dominio de producción respectivo. Las dos versiones anteriores mostraron `Publish deploy` y sus URLs únicas también respondieron 200. Se verificó la disponibilidad del control por sitio sin accionarlo. Se ensayó la reversión Git en un worktree separado con `git revert --no-commit -m 1` en orden inverso y se recuperó exactamente el árbol original de `main`. La republicación en Netlify quedó sin ensayo real dentro de la autorización de solo lectura. [Procedimiento de Netlify](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/#rollbacks).

### Procedimiento sujeto a autorización expresa

1. **Separar integración de publicación.** Confirmar el SHA y los checks de cada entrada de la tabla, `main`, los dos snapshots anteriores y que la cuenta operadora tiene acceso a ambos controles. Con autorización adicional activar `Lock to stop auto publishing` en los dos sitios sobre los deploys que hoy están publicados. Verificar ambos estados de bloqueo, los mismos IDs activos y que no haya una publicación concurrente. La autopublicación activa en ambos es bloqueo actual.
2. **Integrar #46 y #47 en orden, por merge commit si está disponible.** Comparar el árbol de cada nuevo `main` con el valor ensayado. Esperar Actions `test-build` y `browser` del nuevo SHA, comprobar ambos punteros en Netlify y registrar el resultado antes de avanzar. Se ensayó squash y preserva los árboles. Si se elige, registrar sus SHA y adaptar la reversión al tipo de commit.
3. **Preparar #48 contra el nuevo `main`.** Con autorización para actualizar esa rama, incorporar la base vigente y resolver solo `docs/CURRENT_WORK.md` con el archivo de esta rama de auditoría. Comparar el árbol resultante con el ensayado y exigir los checks del nuevo HEAD. Integrar #48 y volver a esperar los dos jobs sobre el SHA de `main`. Verificar que los candidatos de Netlify, si se construyen bajo bloqueo, correspondan a ese SHA y que producción siga en los snapshots registrados.
4. **Prueba y publicación.** Con autorización de publicación aparte, probar primero el candidato de Aliada con POM y datos sintéticos. Confirmar generación en Worker, cancelación sin guardado, persistencia sintética, validación, PDF y un smoke en Safari/iOS físico. En Prestify verificar la portada y el empaquetado y contexto de las funciones, y usar el entorno de prueba de Mercado Pago para una prueba de pagos autorizada. No disparar cobros reales como smoke. Publicar únicamente el sitio autorizado por el operador y verificar SHA, URL, funciones y salud.
5. **Revertir si falla la verificación.** Mantener bloqueada la autopublicación. Con autorización de reversión, elegir `Publish deploy` sobre el ID de `905cb75` del sitio afectado, verificar que vuelva ese ID y que el bloqueo siga activo. Si ambos sitios fueron afectados, repetir con el segundo ID y comprobar cada uno. Separadamente, preparar un PR de revert en Git, en orden #48 → #47 → #46 según el alcance de la incidencia. Para merge commits usar `git revert -m 1`. En el caso de squash revertir el commit simple correspondiente. El snapshot de Netlify no cambia `main` ni restablece variables o datos.
6. **Cortar el avance** si cambia un SHA esperado, falta un check, el árbol difiere, falta un bloqueo, los punteros de producción cambian, el snapshot queda inaccesible o aparece una regresión del Worker, PDF o pago. Mantener el estado comprobado de producción hasta aclarar la discrepancia.

## Registro histórico — preparación de #46 y #47 · 2026-11-16

Leer el [MASTER](ALIADA_HORARIOS_MASTER.md), en especial §6.1 y §9. El [diseño B v3.1](AH2_TRAMO_B_DISENO.md) se incorpora con #46. Los PR registran sus SHA vigentes y la evidencia de Actions asociada a cada uno.

| PR y rama | SHA al iniciar la auditoría | Alcance de la preparación |
|---|---|---|
| [#46](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/46), `claude/aliada-horarios-continuidad-7suuva` | `c58784189ca4c1f147c01d3212a9a1cd8da94473` | Diseño, MASTER, relevo y propuesta P2. |
| [#47](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/47), `feat/ah2-b1-planificacion` | `eb06151b7d175e7c9852d2700397e4880cc7ef2f` | B1 puro. `historial.ts` rechaza vigencias ambiguas e inconsistencias entre el lunes del horario y el de su versión. `errores.ts` tipa la inconsistencia. Dos regresiones en `__tests__/historial.test.ts`. |

### Evidencia de preparación

- **Base:** `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea` integra #45 y tiene el mismo árbol que `21695d9e6a1ccd4e1a5d166fdb70a6972ed4ca6b`. [CI del push a main](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43653262961) exitoso.
- **Integración:** el conflicto original en `docs/CURRENT_WORK.md` se resuelve con el mismo contenido en ambas ramas. La propuesta P2 también es común y deja de requerir un enlace cruzado a un archivo ausente. Conservar los registros históricos de abajo y las discusiones originales de los PR.
- **Pruebas locales:** TypeScript y build correctos en ambos candidatos. Vitest 366 aprobadas y 3 omitidas en #46, 438 aprobadas y 3 omitidas en #47. Benchmark AH2-020 de 200 escenarios sobre #47 y `main`: 0 diferencias funcionales excluyendo tiempos, cobertura media 98,7563 % y 0 violaciones. La suite Playwright del workflow y los checks de cada SHA se registran en los PR.
- **Producción al inicio de la revisión:** Netlify devolvió `ready` y `context: production` para [Aliada](https://app.netlify.com/projects/al-iada/deploys/6af8ee2dae9d7a3ca54d5aef) y [Prestify](https://app.netlify.com/projects/prestify/deploys/6af8ee2d15984dc64ecb3e7d), ambos sobre ese `main`. Los previews de #46 y #47 son automáticos. Aliada y Prestify comparten repositorio, configuración de build y directorio de funciones. Aislar Prestify sigue siendo parte de P0/D13. El rollback #42 queda disponible según su alcance histórico.
- **P2:** la Function verifica el JWT y vuelve a validar. La ejecución SQL se reserva a una credencial de servidor y la transacción comprueba permisos, versión, huellas y revisión. La vía SQL en esquema no expuesto es la preferida. P0 debe comprobar la conectividad y el aislamiento. O1 queda condicionado a P1, P2 y las autorizaciones de §15 del diseño.
- **Alcance ejecutado:** revisión y preparación de #46/#47. Las diferencias de código se limitan a `src/planificacion/`, que la app actual no importa. No hubo merge, deploy de producción, migración ni escritura operativa en Supabase.

### Próximo paso

1. Una vez autorizado, integrar #46. Verificar de nuevo el SHA base y el diff de #47 contra el nuevo `main`; esperar los checks válidos para esa base antes de integrar #47. Coordinar cualquier automatismo de Netlify antes de autorizar cambios en `main`.
2. W1 es el siguiente PR aislado, sujeto a autorización separada. La [propuesta existente](proposals/AH2-020_WEB_WORKER_GENERACION.md) y la auditoría de integración en #47 detallan la equivalencia y la cancelación. W2 conserva su propia autorización (D12).
3. B2–B4, U1–U3, P0–P5, O1, C1, C2, D1 y S1 requieren autorización propia. Las decisiones de activación y publicación se consultan en MASTER y en §15 del diseño.

## Registro histórico — diseño B del 15/11/2026 (#46)

> Estado archivado antes de la preparación conjunta. El punto de retoma vigente está arriba.

> Leer primero `docs/ALIADA_HORARIOS_MASTER.md` (§4.1, §6.1 y §9, en especial AH2-023…AH2-034). Después `docs/AH2_TRAMO_B_DISENO.md` (v3), esta sección y el PR #46.

- **Responsable:** Claude (Claude Code), 2026-11-15.
- **Última instrucción del propietario:** «REVISIÓN FINAL DEL DISEÑO B» (15/11/2026).
  - **Aprueba la dirección general** de la arquitectura.
  - **No autoriza** implementación (B1 incluida), merge, deploy, migraciones, escrituras operativas ni cambios en Prestify.
  - Pidió 8 correcciones obligatorias, que están incorporadas en la v3.
- **Rama:** `claude/aliada-horarios-continuidad-7suuva`, creada desde `main@905cb75`. **PR documental:** [#46](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/46), en borrador. El SHA exacto figura en el PR.
- **Alcance:** solo `docs/`. Los commits llevan `[skip netlify]`.

#### Estado real verificado (15/11/2026, sin cambios desde la v2)
- **`origin/main`:** `905cb75`. Es el merge del PR #45 (contrato PART y «B conjunta»). CI `#39`: `success`.
- **Netlify, sitio `al-iada`:** deploy de producción `6af8ee2d` (`commit_ref 905cb75`, `ready`, 14/11/2026 23:27 UTC). El bundle público contiene `ah2-v2.1-multiarranque-2026-11-14`.
- **PR abiertos:** #46 (este) y los borradores históricos #42 (rollback, intacto), #34, #24, #21 y #20.
- **Semana 47 real** (agregada, informada por el propietario): 406 horas-caja; cobertura 99,14 %; faltantes 3,5; sobrantes 0,5; horas suplementarias PART 0. Coherencia sin certificar optimalidad ni cumplimiento jurídico.

#### Correcciones incorporadas en la v3
1. **Prueba local frente a oficial** (AH2-029, §5.1).
   - El ámbito `prueba-local` nunca llega a PUBLICADO y su PDF dice «PRUEBA LOCAL — NO OFICIAL».
   - Lo oficial pasa solo por la Function `publicar` (JWT y revalidación) y la RPC transaccional (I0).
2. **Vigencia parcial** (AH2-030, §5.4).
   - Tramos de días con recorte (nunca reescritura); reemplazo desde mañana como mínimo.
   - Restricción de exclusión `btree_gist`, bloqueo consultivo y control optimista; prueba de concurrencia.
3. **Historial efectivo por fecha** (AH2-031, §6.4): la versión vigente en cada día, incluidas las reemplazadas después. Nunca borradores, prueba local, descartadas ni fechas futuras. «Planificado vigente» no es asistencia.
4. **Continuidad sin sacrificar cobertura** (AH2-032, §6.2).
   - Objetivo mínimo de 95 % en la 091 y franjas pico protegidas.
   - **Tolerancia 0 hasta aprobar un valor con benchmark** (D9).
5. **Validación técnica frente a jurídica** (AH2-033, §5.6): `PerfilNormativo.estadoJuridico` con fuentes; nunca «legal» sin validación (I13).
6. **D1–D14:** criterio recomendado separado de la autorización expresa; todas las autorizaciones pendientes (§15). Se agrega D14: replanificación del día en curso.
7. **Orden de los PR** (§13): la **publicación oficial O1** depende de P1 (membresías y políticas de acceso) y P2 (RPC, exclusión y Function). U1 queda como **prueba local**.
8. **Corte por trabajo** (AH2-034, §10.5): unidades deterministas e interrupción registrada (`busqueda.completa = false`) y advertida. Hallazgo: hoy la pasada 1 corta a los 6 s **sin registrarlo** (`pasada1-fullpart.ts:152`).

Se mantienen los 10 entregables y las decisiones aprobadas anteriores (AH2-024…AH2-027).

## Registro histórico — B1 del 15/11/2026 (#47)

> Estado archivado antes de la preparación conjunta. El punto de retoma vigente está arriba.

> **Contexto documental:** el diseño v3 y las decisiones AH2-023…AH2-034 están en el PR #46 (`claude/aliada-horarios-continuidad-7suuva`), **todavía no integrado**. B1 lo toma como referencia sin fusionarlo. Las secciones siguientes de este archivo en `main` son anteriores al merge del PR #45 y se actualizan en el PR #46.

- **Responsable:** Claude (Claude Code), 2026-11-15.
- **Autorización del propietario:** «AUTORIZACIÓN LIMITADA DEL TRAMO B1» (15/11/2026). Autoriza **solo** B1.
  - Decisiones aplicadas:
    · ciclos de lunes a domingo;
    · modalidad semanal o mensual con ciclos explícitos;
    · estados de revisión ligados a huellas;
    · prueba local separada de la publicación oficial;
    · semanas históricas preservadas sin publicarlas retroactivamente;
    · vigencia parcial por fechas sin modificar el pasado;
    · replanificación desde el día siguiente;
    · ningún agente aprueba ni publica.
- **Rama:** `feat/ah2-b1-planificacion`, creada desde `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. PR en borrador; el SHA exacto figura en el PR.
- **Estado real:** `main` = `905cb75` (PR #45 integrado y publicado; deploy Netlify `6af8ee2d`). El PR #46 está abierto, en borrador y sin fusionar.

#### Qué se implementó (solo `src/planificacion/`, funciones puras)
| Archivo | Contenido |
|---|---|
| `errores.ts` | `Resultado<T>` y `ErrorPlanificacion` con 32 códigos tipados. Nada lanza excepciones por reglas de negocio. |
| `fechas.ts` | Aritmética de fechas civiles `YYYY-MM-DD` (lunes = 0), sin zona horaria ni reloj. |
| `ciclos.ts` | `validarCiclo`, `validarCalendario` (lunes a domingo, semanal de 1 semana, mensual de 4 o 5, sin superposiciones ni huecos, ids únicos, una sucursal), `cicloDe`, `esPrimeraSemanaDelCiclo` y `semanasDelCiclo`. |
| `huellas.ts` | `jsonCanonico` (claves ordenadas, rechaza NaN y ciclos), `sha256Hex` (SHA-256 puro y síncrono, comprobado contra `node:crypto`), `huellaDe` y `huellasDe` (horario, demanda, reglas, roster, contratos, configuración, ausencias y perfil). |
| `estados.ts` | `transicionar` (validar, aprobar, publicar, descartar, editar, marcar reemplazo total), `validacionVigente`, `revisarCaducidad` y `versionDesdeLegado`. |
| `vigencia.ts` | `aplicarPublicacion`: recorte sin reescritura, continuación del resto, tramos desde mañana como mínimo, control optimista por revisión. También `tramoEfectivoEn`, `verificarSinSolapamientos`, `vigenciaVacia` y `ultimaFechaVigente`. |
| `semana.ts` | `SemanaPlan` sobre `HorarioColaborador` (tipo existente, sin cambios), `jornadasPorFecha` y `mismaJornada`. |
| `historial.ts` | `historialEfectivo` por fecha: solo versiones oficiales publicadas o reemplazadas, solo fechas anteriores a hoy, ausencias descontadas mediante predicado, y legado presunto opcional y etiquetado. |
| `diff.ts` | `diffHorarios` (francos, cambio de tipo de turno frente a ajuste de horario, desvío en minutos, horas, altas y bajas, rango) y `verificarDiasCongelados`. |
| `index.ts` | Punto de entrada del módulo. |

Detalle de lo que garantiza `estados.ts`:
- la prueba local nunca llega a PUBLICADO;
- publicar exige ámbito servidor y una revalidación hecha en el servidor con la misma huella;
- las semanas legadas no se publican;
- un agente o un proceso del sistema no aprueba, publica ni descarta;
- la aprobación propia se configura por sucursal;
- lo publicado es inmutable;
- los mensajes nunca dicen «legal» ni «cumple la ley» (I13).

**Además:** `docs/proposals/AH2_P2_RPC_PUBLICACION_SEGURA.md` documenta el riesgo de que la RPC de publicación se invoque desde el navegador y la solución recomendada para P2: esquema no expuesto, ejecución solo desde la Function, verificación del actor en la RPC y pruebas. **No se implementa en B1.**

#### Pruebas (sobre el HEAD de B1)
- **`src/planificacion/__tests__`:** 42 casos.
  - Ciclos de 1, 4 y 5 semanas, superposiciones, huecos y cambio de mes con y sin ciclo nuevo (#44 (b) y (e)).
  - Flujo de estados completo; prueba local nunca publicada; caducidad por huella; agentes y roles; legado.
  - Reemplazo desde el miércoles y de un solo día; anulación; fechas pasadas y de hoy rechazadas.
  - Concurrencia simulada (conflicto y reintento).
  - **Prueba de propiedad:** 200 secuencias aleatorias × 25 publicaciones, sin solapamientos y sin cambios en fechas transcurridas.
  - Historial por fecha con versión reemplazada; exclusión de borradores, aprobados, descartados y prueba local; ausencias; legado.
  - Diff y días congelados.
  - Huellas (SHA-256 contra `node:crypto`).
  - Textos sin afirmaciones jurídicas.
- **Mutaciones de control:** aceptar fechas pasadas, publicar desde prueba local o contar el día de hoy en el historial hace fallar las pruebas.
- **Resultados:**
  - TypeScript: OK.
  - Vitest: **408 aprobadas**, 3 omitidas.
  - Build: OK.
  - Playwright: **11/11**.
  - **Benchmark de 200 escenarios: 0 diferencias** frente a `21695d9`, idéntico al árbol de `main` (cobertura media 98,756 %, 0 regresiones, 0 violaciones).
- **Compatibilidad:** ningún archivo existente de `src/` cambió. Nada de la app importa `src/planificacion/`, así que el bundle de producción no lo incluye (verificado en `dist/`). Motor, UI, Supabase, Prestify y datos operativos sin cambios.

#### Corrección de calidad del PR #47 (pedido del propietario, 15/11/2026; HEAD revisado `c282b36`)
1. **CI `test-build` en FAILURE** (GitHub Actions, job `132943397824`).
   - La prueba de propiedad (`vigencia.test.ts:84`) superó el timeout de 5 000 ms: 407 aprobadas, 1 fallida y 3 omitidas. El build no llegó a correr.
   - **Causa medida:**
     · el dominio tarda unos 0,5 s (`aplicarPublicacion` 72 ms, `verificarSinSolapamientos` 6 ms, recorridos de la prueba 0,41 s);
     · los otros ~2,7 s eran **unas 750 000 llamadas a `expect`**, una por fecha y por paso;
     · local aislado: 3,2 s; el runner es más lento y corre en paralelo con el resto de la suite.
   - **Corrección:**
     · los invariantes se verifican con lógica plana y un oráculo independiente (barrido de intervalos), se acumulan las violaciones y se afirma una vez por secuencia;
     · se mantienen las **200 secuencias × 25 pasos** y todos los invariantes. Se agregan: la verificación simétrica de fechas transcurridas (no pierden ni ganan vigencia), la unicidad de ids y mínimos de cobertura de la prueba (más de 4 000 publicaciones, más de 400 conflictos, más de 150 000 verificaciones);
     · `verificarSinSolapamientos` pasa de O(n²) a O(n log n), con un caso de intervalos anidados.
   - **Resultado:** 3 163 ms → **~600–700 ms**. **No se modificó el timeout** (ni el global ni uno específico): el margen es más de 7 veces el tiempo medido.
2. **Permisos (`estados.ts`):** con `aprobacionPropiaPermitida`, un supervisor podía aprobar horarios **ajenos**. Ahora:
   - un supervisor solo aprueba **su propia** versión y solo si la sucursal lo habilita;
   - las versiones ajenas requieren aprobador, director regional o admin de empresa;
   - auditor, nunca;
   - pruebas: matriz completa de 5 roles × propia o ajena × política.
3. **Huellas (`huellas.ts`):** política canónica explícita.
   - **Ausente ≠ nulo:** en la raíz, el token `undefined` (que ningún JSON produce); una propiedad `undefined` = ausente; `undefined` o huecos en arreglos se rechazan (antes colisionaban con `null`).
   - Solo datos planos. Se rechazan con la ruta del valor: Date, Map, Set, RegExp, arreglos tipados, instancias de clases, primitivos envueltos, claves símbolo, getters, bigint, funciones, NaN e infinitos.
   - Unicode **NFC** en claves y valores, con rechazo de claves que colisionan tras normalizar.
   - Pruebas: colisiones semánticas (35 valores distintos sin huellas compartidas; ausente, nulo y vacío distintos en `EntradasHorario`), equivalencias (orden, −0, NFD/NFC), 16 tipos rechazados, 500 valores aleatorios iguales a una referencia con `node:crypto`, y estabilidad tras la ida y vuelta por JSON/jsonb.
4. **Identificadores:**
   - Antes, reutilizar un `publicacionId` generaba en silencio tramos `P1:0` repetidos. Ahora `ID_DUPLICADO`.
   - `publicacionId` con formato validado (`ID_INVALIDO`; «:» reservado).
   - Se rechaza un estado de entrada con ids repetidos.
   - Control final de unicidad de todos los ids resultantes.
   - En `historialEfectivo`, versiones con id repetido → `ID_DUPLICADO` (antes el `Map` se quedaba con la última).
5. **Verificación:** ver la evidencia en el PR #47 (suite completa, TypeScript, build, Playwright, benchmark de 200 escenarios y checks `test-build` y `browser` en GitHub).

## Registro histórico — W1 · Web Worker · 2026-11-16

- **Alcance:** W1 autorizado como PR independiente en borrador. [PR #48](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/48), rama `feat/ah2-w1-web-worker`. Base `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. SHA del código y de las pruebas `5d0f4e9a99c1e960276b6a1fd1c68729fdb02ac2`. El PR registra el SHA de esta actualización y sus checks.
- **Autoridad de producto:** [MASTER](ALIADA_HORARIOS_MASTER.md), en particular AH2-020. Referencias [diseño B en #46](https://github.com/FernandoDelgadoDiaz/Estimapres/blob/beaa8ab1a7a5d15f733fa1a23152f3266e196fb2/docs/AH2_TRAMO_B_DISENO.md#105-generación-escalable-y-reproducible-corrección-8) y [auditoría W1 en #47](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/47#issuecomment-6907418304). Ambos PR siguen en borrador; esta rama parte directamente de `main`.
- **Código:** `src/workers/generacion.worker.ts` llama a `generarConMultiArranque` sin cambios a motor, contratos, validador ni presupuestos. `generacionCliente.ts` separa mensajes por ID, maneja inicio y errores y termina el Worker. `iaAsignacion.ts` mantiene el adaptador y el respaldo síncrono para navegadores sin Worker de módulo o con fallo de carga, con aviso de posible pausa.
- **Flujo:** `useAsignacion.ts` invalida y cancela el trabajo al reiniciar, salir o cambiar entradas. `NuevaSemanaPage.tsx` guarda solo un resultado vigente y reparte el render del resumen y de las tablas entre cuadros. Un error tras iniciar permite reintento; un resultado tardío se descarta antes de modificar la UI o el historial.
- **Operación:** Aliada y Prestify mantienen sus deployments de producción en `905cb75`, verificados vía Netlify. Se excluyeron merge, deploy de producción, migraciones y escrituras operativas de las pruebas. Archivos de configuración, Supabase y funciones de pago intactos. Los previews automáticos son independientes de producción.

### Verificación

| Prueba | Resultado local |
|---|---|
| TypeScript, Vitest y build | TypeScript y build OK. Vitest 368 aprobadas y 3 omitidas. |
| Playwright Chromium | 15 aprobadas y un benchmark optativo, ejecutado aparte. Incluye PDF, guardado, edición, cancelar, reintentar, fallos de carga, reiniciar y cambiar de pantalla. |
| Equivalencia Worker real ↔ hilo principal | Semana sintética 47 y los 200 escenarios AH2-020: 0 diferencias funcionales, 0 estrategias omitidas y 0 violaciones. Cobertura media 98,7563 % en los 200. La comparación incluye jornadas, horas, cobertura, selección y estado del validador. Se excluyen duraciones de diagnóstico. |
| Benchmark offline de referencia | 200 escenarios con `AH2_BENCH=1`. Mismos resultados que `main` al excluir duraciones. |
| Rendimiento en build de producción | 12/12 con Worker. 12/12 en modo compatible como referencia. Coincidieron las huellas de jornadas, horas por persona y cobertura/faltantes por franja, y coincidieron estrategia, validación y omitidas. Cancelación durante el cálculo en 55/6×: 12 ms al retirar el control y cero guardados. |

Tarea más larga del hilo principal en milisegundos. Cada celda indica **Worker / modo compatible**. El modo compatible ejecuta el mismo cálculo en el hilo de la página.

| Cajeros | CPU 1× | CPU 4× | CPU 6× |
|---|---:|---:|---:|
| 9 (tamaño 091) | <50 / 577 | 135 / 1.927 | 59 / 2.685 |
| 20 | <50 / 817 | 53 / 2.462 | 75 / 4.354 |
| 35 | <50 / 1.769 | 70 / 7.541 | 127 / 11.442 |
| 55 | <50 / 1.703 | 181 / 8.333 | 168 / 10.086 |

Chromium 141 en Linux. CDP ralentiza el hilo de la página; el tiempo del Worker corresponde al equipo de ensayo y no simula por sí solo un dispositivo físicamente 6 veces más lento. El resultado tardó 0,52–2,38 s con Worker y 0,66–11,75 s en modo compatible. El retraso máximo del temporizador durante la prueba Worker fue de 5 ms.

### Cortes por tiempo heredados

- **6 s, pasada 1.** La primera pasada completa su recorrido. El límite puede cortar una vuelta posterior y cambiar jornadas sin generar un indicador específico. En `w1-limites.test.ts`, el escenario 121 produce jornadas diferentes al adelantar el reloj a 6001 ms antes del segundo recorrido.
- **20 s, multiarranque.** Controla si se empiezan más estrategias, conserva el respaldo e informa las omitidas. En el escenario 121, al simular 20.000 ms antes de evaluar alternativas, se omitieron las seis y quedó la menor cobertura del respaldo. En la matriz real de esta revisión ninguna combinación omitió estrategias y la huella funcional coincidió.
- W1 conserva ambos cortes y la prioridad del motor. Una pérdida funcional reproducible atribuible al transporte por Worker bloquea su integración. La reproducibilidad cuando uno de los presupuestos se agota corresponde a W2, sujeta a autorización específica.

### Reproducir y continuar

1. `npm ci && npx tsc --noEmit && npm test && npm run build && npm run test:e2e`.
2. `AH2_WORKER_BENCH=1 npx playwright test e2e/generacion-worker.e2e.ts`. Benchmark de referencia: `AH2_BENCH=1 AH2_BENCH_N=200 npx vitest run src/algoritmo/__tests__/benchmark/prioridadHoras.bench.test.ts`.
3. `npx playwright test -c playwright.perf.config.ts` sobre el build sin credenciales. Repetir con `AH2_PERF_MODO=hilo`. Opcional: `AH2_PERF_OUT=<json>`.
4. Revisar los checks del SHA final del PR #48. Cualquier integración requiere autorización y verificar los automatismos de Netlify de ambos sitios. Al integrar ramas con cambios en CURRENT_WORK, conservar el punto de retoma vigente y los registros históricos.

> El tramo A de abajo documenta una sesión anterior a su integración. #45 ya está integrado en `905cb75`.

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
