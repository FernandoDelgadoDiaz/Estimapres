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
