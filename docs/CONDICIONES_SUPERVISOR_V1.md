# Condiciones opcionales y comparación individual — laboratorio v1

19/11/2026. Evidencia técnica, no autoridad de producto. Decisiones únicamente en MASTER §9 AH2-039, AH2-040 y propuesta AH2-040-P1. Continuidad únicamente en CURRENT_WORK rector. Sin activación productiva, persistencia, migración, merge ni deploy.

## Implementado

- Contrato opcional `condiciones_supervisor` versión 1: sucursal, lunes de semana, filas con ID único, DEBE/PREFERIRIA, persona estable (FULL/PART), vigencia `desde`/`hasta` inclusiva, tipo, día/valor según corresponda. Valida fechas, pertenencia, duplicados, versión y ámbito. No indicar condiciones conserva el camino anterior.
- DEBE: franco en día concreto; turno con ventana de ingreso y fin explícita; exclusión manual de toda la semana; máximo local de francos por fecha. Los límites manuales no relajan los existentes. No se inventa una frontera universal entre mañana y tarde. El turno restringe jornadas trabajadas, nunca obliga a trabajar un franco.
- PREFERIRIA: franco, turno o franco/medio franco adyacentes para FULL. Se cuenta cuántas condiciones/días quedan insatisfechos, sin pesos empresariales inventados. La adyacencia se mide dentro de esta semana; no se infiere continuidad circular domingo–lunes. La regla de medio franco obligatorio no cambia.
- La exclusión requiere toda la semana y elimina únicamente a esa persona del cálculo automático y de sus contratos/semillas internos. No infiere franco, ausencia ni disponibilidad manual; el input original permanece intacto. Exclusión parcial o condiciones simultáneas sobre la persona excluida se diagnostican. AUX y EVENTUAL siguen mediante matrices de presencia/disponibilidad, sin cambiar AH2-036–038.
- En A, las nuevas restricciones se enlazan por ID, también con homónimos; las antiguas excepciones por nombre conservan su semántica heredada. B exige nombres técnicos únicos como su contrato anterior; entradas ambiguas se rechazan antes de excluir personas, sin borrar restricciones ajenas.
- Snapshot en salida A/B, metadatos del adapter y PDF con condición, valor, persona, ventana y vigencia. El validador A relee además el snapshot sin depender del filtro del generador: una edición incompatible vuelve a ser rechazada. No publica automáticamente.

## Preflight y selección

Se bloquean datos incompatibles de sucursal/semana/identidad, conflictos de presencia/supervisión ya conocidos, demasiados francos forzados y capacidad de francos insuficiente. A usa su DP individual; B usa catálogos, restricciones necesarias y la DP PART. Sus pruebas individuales no certifican factibilidad conjunta. Se informan IDs causales cuando están disponibles; no se relaja ninguna condición.

No encontrar conflictos en preflight **no prueba factibilidad global**. A puede declarar `GENERACION_SIN_PLAN_VALIDO` si su búsqueda no obtiene un plan que pase el validador; no equivale a inviabilidad matemática. B conserva INFEASIBLE/UNKNOWN separados. Un déficit POM con todas las obligaciones satisfechas no se confunde con inviabilidad.

A calcula primero la referencia bajo las condiciones duras y ensaya una guía blanda. Solo la acepta si pasa la validación, no empeora ninguna franja ni el sobrante; preserva la prioridad AUX/EV. Ante empate usa el contador de preferencias. Es heurística, no certificación del mejor cumplimiento blando posible. Las semillas exploratorias del multi-arranque sin objetivo PART son solo intermedias: se restauran contratos antes de seleccionar. Los fallos de candidatas condicionadas no borran la referencia válida.

B incorpora `condiciones_blandas` como última fase lexicográfica, después de cobertura, sobrantes, recursos, ciclo/equidad y preferencias existentes. No agrega un corte temporal por tener preferencias. Usa el presupuesto de búsqueda existente, incluyendo preparación/preflight; reporta tiempo real, fases/cotas y validación. Solo se conserva una referencia compatible con las nuevas condiciones.

`minimum_impact` conserva su orden de mínimos cambios aprobado; esta entrega no rediseña ese refinamiento ni lo conecta con producción. Las condiciones duras pasan por el dominio/modelo y el validador común de B; la optimización activa de preferencias nuevas se verifica en el solver semanal.

## AH2-040-P1 — propuesta concreta pendiente

Analizadores `analizarComparabilidad` / `analyze_comparability`: por cada par individual propuesto muestran horas-caja efectivas y oportunidades. Se excluye supervisión exclusiva, se exigen presencia y demanda POM, se respetan apertura, cortes, reservas sectoriales y tope cero. Las oportunidades EVENTUAL deben estar contenidas íntegramente en las AUX. No usan carga media grupal ni asignan pares automáticamente.

El propietario debe ratificar o modificar **esa definición** y el modo de seleccionar pares por persona. La futura relación sería `EV ≤ AUX` por par aprobado, adicional al máximo explícito. Ahora se calcula la diferencia numérica como diagnóstico experimental, no como infracción homologada. Sin un par, se informa ausencia de comparación: no se fabrica un máximo ni se excluye automáticamente al eventual.

La pérdida de cobertura al imponer la relación es **NO PROBADA**. No se implementa un límite arbitrario pendiente de esa definición. La política v1 continúa no publicable y, si falta máximo eventual, mantiene el diagnóstico de AH2-040 pendiente. Esto no declara completamente implementada ni homologada AH2-040.

## Uso y pruebas

Laboratorio `/lab-condiciones.html` con `npm run dev -- --host 127.0.0.1`, datos sintéticos, sin ruta productiva y sin localStorage, Supabase ni red de escritura. Condiciones opcionales → verificar → generar prueba. No hay aprobación/publicación ni guardado. Ventanas de turno y semana del demo están identificadas como sintéticas, no política 091.

Comandos A: `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run test:e2e`. B: `python -m pytest -q`; smoke histórico `python -m optimizer.benchmark --fixtures fixtures --seconds 2 --jobs 2 --modes hybrid --output /tmp/smoke.json`.

Fixtures `condicionesBCalculadas.json` / `fixtures/condiciones/cruzadas.json`: tres soluciones sintéticas B con snapshot común (franco, turno fechado, preferencia), recalculadas en OR-Tools 9.15, 3 s y un worker; OPTIMAL para el modelo representado. El validador A vuelve a comprobar las jornadas y contratos; no confía en métricas del solver. Test PDF extrae texto con pdf.js; test de navegador comprueba conflictos y ausencia de escrituras.

Resultados y SHA exactos se registran en el único CURRENT_WORK rector y en los checks reales de cada PR. Limitaciones: no integración UI operativa ni persistencia oficial; no benchmark real 091; generalización 3+ AUX y comparabilidad AH2-040 pendientes. No se modificaron reglas ni datos de producción.
