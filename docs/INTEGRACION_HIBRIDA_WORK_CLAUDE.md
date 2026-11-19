# Integración híbrida Aliada Horarios 2.0 — contrato Work ↔ Claude

Estado: **IMPLEMENTACIÓN AUTORIZADA SOLO EN RAMAS EXPERIMENTALES. SIN APROBACIÓN PARA MERGE NI DESPLIEGUE.**
Fecha de inicio: 2026-11-19. Sucursal piloto: 091. Propietario: supervisor de la sucursal.

## 1. Única fuente de verdad y protocolo de continuidad

- **Repositorio rector:** `FernandoDelgadoDiaz/Estimapres`, rama `feat/ah2-integracion-hibrida-work-claude`.
- **Estado operativo único:** `docs/CURRENT_WORK.md` de esta rama, **primera sección**. Cada agente la lee al comenzar y la actualiza al terminar un bloque de trabajo. Conservar el historial debajo; no borrarlo ni reemplazarlo por reportes genéricos.
- **Decisiones estables y límites:** `docs/ALIADA_HORARIOS_MASTER.md`. Solo registrar como APROBADO lo que el propietario aprobó; propuestas y supuestos quedan etiquetados.
- Este documento fija el **contrato técnico**; no duplica la bitácora de progreso.
- **Repositorio de solver:** `FernandoDelgadoDiaz/aliada-optimizer`, rama `feat/integracion-aliada-work-claude`; `docs/CURRENT_WORK.md` allí es solo bitácora técnica local y enlace a este registro rector, nunca otra fuente de decisiones.
- **Ritual de relevo de Work a Claude y viceversa:** (1) obtener HEAD y comparar estado remoto; (2) leer MASTER, primera sección CURRENT_WORK y PRs de ambas ramas; (3) ejecutar el próximo paso exacto, sin duplicar lo completado; (4) ejecutar tests y guardar evidencias; (5) hacer commit/push de un cambio acotado; (6) actualizar CURRENT_WORK con autor/agente, hora, base y HEAD, qué se hizo, comandos y resultados efectivos, riesgos, próximo paso, PRs; (7) el otro agente verifica HEAD antes de editar. No compartir ramas editadas simultáneamente; no sobrescribir trabajo ajeno ni hacer force-push.
- Si cambia el alcance o aparece conflicto, registrar **BLOQUEADO** y pedir decisión al propietario. No asumir aprobación a partir de esta orden de desarrollo.
- Documentación privada con personal real, PDF, snapshots Supabase y claves **fuera de GitHub, PR y CI**. Solo fixtures sintéticos o anonimizados.

## 2. Referencias inmutables (antes de cualquier cambio)

- Estimapres [PR #59](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/59), SHA base `98cedebef1989249aa69b7e46b617b78d0367e8e` (en borrador). La rama de integración nace de este commit, no del main productivo.
- Solver [PR #5](https://github.com/FernandoDelgadoDiaz/aliada-optimizer/pull/5), SHA base `df32c00cdb4854640787aded824e103ff7eb41d3` (en borrador), sucesor de #4.
- Laboratorio #5 implementa `optimizer.minimum_impact.refine_week`, **opt-in y offline**; no está conectado al generador productivo. La UI de #59 tampoco integra todavía B semanal.
- Baseline real 091 (23–29/11/2026): POM 217 franjas, 402 horas-caja. V1 guardada 96,27 %, 15 h faltantes, cero sobrantes, infracción de corte mínimo. Ensayo final de siete cajeros sin Gabriel: 99,75 %, 1 h faltante, cero sobrante total, 272 h contractuales, cero movimientos de francos, 28 jornadas modificadas, zero infracciones detectadas con V9 como domingo condicional. **Es una prueba offline, no una planificación aprobada ni prueba de calidad futura.**
- Pendientes de aceptación laboral: horario manual efectivo de Gabriel, preferencias/excepciones históricas y ciclo de planificación; no inventar datos.

## 3. Decisiones del propietario que NO deben perderse

1. Construir **motor híbrido**, manteniendo A determinístico como referencia y respaldo; B CP-SAT + refinamiento de mínimo impacto debe ser opcional/seguro hasta homologación.
2. UX simplificada: acción primaria **Generar horario recomendado**, una propuesta validada con explicaciones de cambios y aprobación humana; no mostrar controles técnicos de solver al supervisor.
3. **Reglas normativas y operativas obligatorias nunca se relajan** por cobertura, rendimiento o preferencias. Validadores independientes sobre candidatas, incluyendo reglas locales y descanso domingo→lunes.
4. **Exclusiones manuales por colaborador**: Gabriel Silva se administra manualmente por cobertura en otro sector de 06:00 a 10:00. Hasta disponer de su horario manual autorizado, el generador no cambia sus turnos ni considera esas horas como caja. No modificar su regla almacenada; diseñar excepción explícita auditable sin filtrar horas de otro sector a demanda de cajas.
5. Siete cajeros restantes: respetar contrato y francos bloqueados del plan de referencia cuando el supervisor elija ese criterio. Evitar que un benchmark temporal se convierta en regla universal de franquear sin permiso.
6. AUX y eventuales: **mantener presencia**; mover únicamente asignaciones a caja dentro de disponibilidad y límites.
7. Reportar **sobrantes dentro de POM y fuera de POM**, en particular 22:30–23:00, y déficits por franja. No esconder regresiones locales bajo un porcentaje global.
8. No borrar, aprobar ni comunicar V1 por efecto de la integración. Los horarios semanales reales siguen un circuito de aprobación separado.

## 3.1 Cambio de producto de máxima prioridad: AUX/eventuales/dotación (19/11/2026)

**Autoridad normativa única:** MASTER [AH2-036, AH2-037, AH2-038](ALIADA_HORARIOS_MASTER.md). Estas referencias prevalecen sobre los resultados previos de laboratorio y sobre objetivos porcentuales del 99,75/99,88 %. No duplicar aquí decisiones de producto.

**Gates técnicos obligatorios para A, B y validadores comunes:**

1. El presupuesto FULL/PART se asigna a caja conforme a sus contratos; AUX cubre demanda residual **antes** de EVENTUAL cuando haya disponibilidad efectiva y un responsable de supervisión distinto. Un candidato que usa eventuales mientras un AUX libre puede cubrir exactamente la misma franja debe ser penalizado según la prioridad acordada o rechazado cuando se declare una regla operativa obligatoria.
2. Si coinciden **dos AUX** y existe demanda de caja no cubierta, reservar uno para **supervisión de pie** y asignar preferentemente al segundo a caja. Ambos deben tener presencia efectiva; no doble contar supervisión/caja, ni inventar demanda. Casos con 3+ AUX son generalización propuesta, no decisión confirmada.
3. Configuración local 091, 08:00–09:00 con AUX único y sin FULL/PART: exigir la decisión explícita de supervisión compatible. Nunca suponer que caja y supervisión de pie ocurren simultáneamente. Los casos sin responsable autorizado quedan advertidos/bloqueados.
4. **No pedir al supervisor un tope de horas-caja semanales para AUX**: la capacidad surge del modelo de asignaciones por franja, presencia y supervisión. Para EVENTUAL soportar máximo semanal por colaborador, con reservas sectoriales cuando consten. **12 h es un escenario ilustrativo, no un default aprobado.** Con límite activo, no sacrificar tareas principales por buscar 100 %.
5. Si la cobertura factible queda por debajo de 100 %, mostrar la brecha real y generar simulaciones marginales de **+32 h PART** y **+48 h FULL** en escenarios sintéticos de nueva contratación, con descansos, francos, turnos y supervisión; indicar supuestos y diferencia vs plantilla vigente. Sin altas reales ni escrituras.
6. Tests mínimos: doble AUX con demanda residual y eventual disponible; doble AUX sin demanda residual; AUX único 08–09 sin política de supervisión; eventual con tope semanal alcanzado; preservación de presencia sectorial; fallback de A con restricciones; escenarios +32/+48 no sobreestiman cobertura. Comparar métricas por franja, no solo porcentaje agregado.

**Efecto sobre el ensayo 091:** las coberturas 99,75 % / 99,88 % de ensayos anteriores no son aprobables como demostración de optimización útil por rol; revaluar después de implementar topes/roles y respetar obligaciones sectoriales.

## 3.2 Parametrización opcional y prioridad AUX/EV — condiciones del supervisor

**Decisiones canónicas:** MASTER AH2-039 y AH2-040. Desarrollar exactamente lo aprobado, sin inventar topes legales, cambios de franco o reglas que el supervisor no cargó.

1. El **preflight** valida en la semana y sucursal reales las condiciones opcionales y persistidas: franco obligatorio por persona/día; turno de mañana/tarde obligatorio; máximo de francos simultáneos (p. ej. 2 en la 091); no disponibilidad; supervisor presente; preferencias blandas de turno y franco/medio franco corrido. DEBE vs PREFERIRÍA se serializa y muestra claramente. Las reglas del usuario no reemplazan automáticamente legislación ni reglas obligatorias.
2. Si la combinación de obligaciones es incompatible (p. ej. ocho cajeros de franco el lunes donde se requieren cajeros o se excede el máximo diario), **bloquear la generación aprobable** e informar los conflictos concretos y qué condiciones podrían modificarse; jamás relajar sin consentimiento. Una baja cobertura por falta de recursos no equivale por sí sola a demostración de problema matemático inviable: diferenciar horario factible con déficit de horario técnicamente incompatible.
3. **Prioridad A/B idéntica**: FULL/PART contratados → AUX elegibles con supervisión cubierta → EVENTUAL solo déficit residual; minimizar uso EVENTUAL en las soluciones con cobertura comparable **sin sacrificar restricciones duras**. No permitir reemplazo de AUX elegible por EVENTUAL en la misma franja sin justificación.
4. **Relación semanal EVENTUAL ≤ AUX comparable disponible para caja** (intención obligatoria del propietario, no un simple promedio entre grupos). Definir rigurosamente el AUX de comparación, considerando franja de solapamiento, presencia, rol de supervisor y elegibilidad. Evitar forzar cero horas EVENTUAL por comparación con un AUX que supervisa exclusivamente o que no coincide en presencia. Validar la definición antes de ejecutar piloto; si el cumplimiento genera déficit, comunicarlo, no ocultarlo.
5. La UI no exige agregar restricciones cada semana: carga **opcional**, ámbitos y vigencias persistibles, defaults sectoriales y de sucursal versionados. Especificar de qué modo se guardan snapshots sin migración destructiva ni escrituras productivas hasta autorización.
6. Fijar tests sintéticos mínimos A/B/validadores: lunes todos de franco, límite local de 2 francos; mañana obligatoria, tarde obligatoria, preferencias contradictorias blandas; franco y medio franco corrido preferido; AUX supervisor excluido de comparación; dos AUX elegibles y EVENTUAL en franja coincidente; EVENTUAL sin tope individual pero con relación semanal; EVENTUAL con tope individual; máxima cobertura factible con restricciones rígidas; diagnóstico de inviabilidad y ausencia de modificaciones automáticas. Registrar filas de franja, causas y métricas comparables, nunca solo porcentaje agregado.

**Orden de ingeniería:** esta etapa y AH2-036/038 se implementan **antes** de integrar o habilitar B en producción. No publicar una mejora que viole las reglas del personal de apoyo por obtener 100 % de POM.

## 4. Arquitectura a implementar — requisitos, no tecnología supuesta

- **A**: generación determinística disponible inmediatamente y conservada como respaldo.
- **B**: resolver CP-SAT y refinar solo con entradas completas, reglas y contratos homologados; resultados no aprobados quedan en evaluación. No elegir B si viola una regla, degrada una franja protegida o pierde ante la referencia según criterio explícito. El resultado debe preservar métricas y trazabilidad.
- **Adaptador único y versionado**: entrada POM, fichas/contratos, disponibilidad AUX/eventual, reglas individuales, exclusiones manuales, franco fijo o protegido, antecedente dominical programado, historial/ciclo con procedencia, pesos declarados. Salida con plan, métricas por franja, explicaciones y reporte de validadores. No confundir borradores con trabajo efectivo.
- **Ejecución segura**: CP-SAT Python NO corre directamente en navegador. Antes de implementar, verificar límites y costos de alojamiento/worker, autenticación, privacidad, cola/asincronía, expiración y limpieza de datos, observabilidad, idempotencia y cancelación. No elegir o provisionar servicios pagos sin autorización. Ante error, timeout o datos insuficientes, entregar A válida o informar bloqueo; no presentar resultados experimentales como aprobados.
- **Supervisor**: mostrar estado de progreso sin bloquear el navegador; recomendar una sola alternativa con diff de turnos/francos, faltante, sobrante total, eventuales y autorizaciones. La aprobación y publicación se conservan como acciones deliberadas separadas.

## 5. Orden de trabajo y criterios de cierre

**Fase 1 — homologar contrato, seguridad y arquitectura.**
Auditar #59 y #5, comprobar formato de intercambio y validador compartido, resolver versión/procedencia de entradas, arquitectura de ejecución (opciones y costos reales), límite de tiempo, política de datos y casos de error. Decidir técnica en PR documentado con pruebas; si requiere gasto o permisos nuevos, parar esa parte.

**Fase 2 — implementación aislada end-to-end.**
Implementar adaptadores A→B→refinamiento→validación→selector con pruebas sintéticas. Fallback probado. Exclusiones manuales por colaborador y reglas franja/aux/eventual. Flujo interfaz de cuatro acciones sin complicar uso cotidiano. No dar acceso productivo al solver hasta superar gates.

**Fase 3 — homologación real privada y no destructiva.**
Comparar A vs B vs híbrido con idénticos snapshots y procedencia en 091. Probar fallos, límites, concurrencia, datos incompletos, equidad/ciclo e historia real cuando esté acreditada. Recontar 217 franjas, horas individuales, 22:30–23:00, francos, 12 h domingo-lunes, cierres y excepciones. Guardar datos personales solo en entorno privado. CI con fixtures sintéticos. Reportar métricas, cambios, costes, tiempos y regresiones de cada franja.

**Fase 4 — gate de publicación separado.**
Proponer PR de integración y plan de despliegue/rollback. Verificar bases/SHAs, tests, seguridad, permisos y compatibilidad; obtener autorización **explícita posterior** del propietario antes de merge a main, cualquier migración o cambio en Supabase/Netlify. No tocar Prestify.

## 6. Formato obligatorio de encabezado CURRENT_WORK

```md
## PUNTO ÚNICO DE RETOMA — integración híbrida (fecha y hora Argentina)
Estado: EN CURSO / BLOQUEADO / LISTO PARA REVISIÓN
Agente que entrega: Work / Claude | Agente receptor: ...
Ramas y SHAs: Estimapres ... ; aliada-optimizer ...
Cambios concretos desde último relevo: ...
Pruebas ejecutadas y resultados (no promesas): ...
Decisiones aprobadas / propuestas pendientes: ...
Bloqueos, seguridad y datos: ...
PRs/artefactos relevantes: ...
PRÓXIMO PASO EXACTO (acción verificable): ...
```

**Primer próximo paso para Work**: auditar código real de ambos HEAD y diseñar/probar contrato único de entrada/salida y opción de ejecución CP-SAT segura; actualizar CURRENT_WORK y los PR en borrador. No empezar el despliegue.
