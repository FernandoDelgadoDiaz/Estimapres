# Recursos operativos v1 — implementación experimental AH2-036/037/038

Autoridad de producto: MASTER. Estado y relevo: primera sección de CURRENT_WORK. Este documento describe código y mediciones, no crea políticas de negocio ni autoriza publicación.

## Cambio concurrente de autoridad detectado
Durante el trabajo se agregaron AH2-039/040 en los commits documentales 78b2bb6, ecaf76e y f4850e7 de Estimapres. La actualización del ref con lease del HEAD anterior no se aplicó. Se conservan íntegros esos cambios, con código basado en el último árbol.

**Entrega acotada AH2-036–038, no integración completa del contrato actualizado.** Falta el preflight opcional DEBE/PREFERIRÍA de AH2-039 y homologar/modelar la comparación individual semanal EVENTUAL ≤ AUX de AH2-040. No se usa un promedio ni se compara con AUX no elegible. La política v1 queda explícitamente no publicable en los validadores/resultados aun si sus controles implementados no detectan infracciones. No hay activación en la UI.

## Alcance y contrato

La política es **opt-in y versionada** con `politica_recursos_version: 1` en la entrada semanal y la configuración operativa que recibe el validador. Las llamadas sin versión conservan la semántica histórica; esto permite auditar regresiones y revertir sin editar datos. La UI productiva todavía no activa esta política ni permite configurarla: queda pendiente su integración segura. Los simuladores y fixtures de esta entrega sí la activan en ambos motores.

- FULL/PART mantienen horas individuales exigibles. El catálogo FULL implementa 48 h; una ficha FULL distinta o ausente queda como dato incompatible, no se convierte automáticamente en 48. PART exige objetivo individual y perfil vigente. No se agregan horas para cobertura.
- AUX conserva presencia y supervisión. Con dos presentes y demanda residual, se asigna uno a caja y queda otro de pie, respetando corte y supervisor de jornada completa cuando está configurado. Se elimina la posibilidad de que B omita AUX elegible por conveniencia de la función objetivo. No hay un campo de tope semanal AUX: las horas resultan de franjas, demanda y presencia.
- EVENTUAL conserva presencia y cubre solo el resto. `max_caja_eventual_slots` es un diccionario por ID, en medias horas enteras (0 permitido). **Sin default de 12 h.** AH2-040 permite omitir el tope explícito: en ese caso hace falta la comparación semanal homologada AUX/EV, todavía pendiente. El prototipo informa `POLITICA_EV_COMPARACION_PENDIENTE` y no fabrica un tope ni permite una propuesta operativa. Los límites no modifican horas laborales ni presencia.
- `reservas_sector_eventual` contiene matrices booleanas 7×30 por ID: true reserva ese tramo para sector. No modifica la matriz de presencia original. Sigue vigente el límite de bloques y hora final de caja.
- `supervision_apertura_externa` es una matriz booleana 7×30 de declaración explícita de un responsable externo compatible/autorizado por franja. No habilita doble rol ni aporta cajas. Con AUX único 08–09 y demanda, sin esa declaración hay conflicto bloqueante. Los fixtures declaran un supuesto sintético de responsable externo; **no es autorización para 091**.
- Con 3+ AUX se informa `POLITICA_AUX_MULTIPLE`: el MASTER pide una generalización revisable. No se aplicó a la 091 una regla nueva de 3+ como si estuviese aprobada.

Los diccionarios de configuración/UI usan IDs estables de UI; el adapter los transforma a IDs internos del motor. B usa los IDs internos del snapshot. `supervision_apertura_externa`/reservas tienen 30 slots desde 08:00 (último: 22:30–23:00); POM de UI conserva 31 filas 07:00–22:00. No inventar demanda en el último slot técnico.

## Código ejecutable

A: `politicaRecursos.ts`, pasadas 2/3, adapter, validador independiente UI, `simulacionDotacion.ts`, `recursosResumen.ts`. `simularDotacion(inputV2)` calcula tres escenarios y devuelve entrada, resultado, métricas y validación. Usa IDs técnicos normalizados. Las altas simuladas tienen disponibilidad completa hipotética y contrato exacto 32/48; deben sustituirse por datos reales antes de una decisión de contratación. No hay persistencia. El resumen separa horas de presencia, caja y no-caja; no-caja no es ocio ni descanso.

B: `staffing.simulate_staffing`, modelo global, selección independiente, refinamiento mínimo y validador. El orden v1 es faltantes, protección ponderada, sobrantes, uso eventual, ciclo/equidad/preferencias. La opción compacta respeta ese orden usando fases en v1. El refinamiento preserva la cobertura conseguida y prioriza uso eventual antes de impacto humano. Un plan A que incumpla la política nueva no es respaldo válido.

## Mediciones nuevas — exclusivamente sintéticas

Se calcularon A y B sobre las mismas tres entradas, con referencias A revalidadas en B. Demanda semanal **280 h-caja**, plantilla base sintética 1 FULL 48 h + 1 PART 32 h, 2 AUX con solapamiento parcial, 1 eventual con tope sintético 8 h, supervisor externo sintético en apertura, corte 22:00 y dos bloques eventuales. Ese valor 8 es de la prueba y **no configura ninguna sucursal**.

| Plantilla | A cobertura | B cobertura | Faltante A/B h | Sobrante A/B h |
|---|---:|---:|---:|---:|
| Base | 36,43 % | 36,43 % | 178 / 178 | 0 / 0 |
| +32 h PART | 47,86 % | 47,86 % | 146 / 146 | 0 / 0 |
| +48 h FULL | 53,57 % | 53,57 % | 130 / 130 | 0 / 0 |

Estos valores coinciden con sumar horas útiles porque esta prueba tiene demanda suficiente; **se ejecutaron los modelos, no una suma lineal**. B empleó presupuesto de hasta 10 s, semilla 20261119, un worker, y certificó los objetivos del modelo protegido por la referencia; no certifica la normativa jurídica ni superioridad de B. Ver CSV con hashes de entrada, resultados JSON y fases/cotas del repositorio B. Las tres propuestas de B se vuelven a validar con el validador independiente de A en el fixture de contrato. No hay mejoras de cobertura de B en esta prueba.

Una prueba adicional A con demanda acotada, sin cajeros base y eventual con tope sintético 2 h, mide:

| Escenario | Faltante h | Sobrante h |
|---|---:|---:|
| Base | 5 | 0 |
| +32 h | 0 | 26 |
| +48 h | 1 | 44 |

Agregar personal no equivale a ganar automáticamente esas horas de cobertura; además puede crear sobrantes porque las horas contractuales se mantienen. Es una búsqueda heurística A, no una prueba de inviabilidad del caso +48 ni recomendación comercial. Datos en `docs/evidencia/recursos-saturacion.json`.

## Pruebas y reproducción

- `npm test` y `npm run build` en Estimapres.
- `npm test -- src/algoritmo/__tests__/recursos-operativos.test.ts src/algoritmo/__tests__/dotacion-recursos.test.ts src/algoritmo/__tests__/recursos-contrato-b.test.ts`.
- `python -m pytest -q` en B; CI mantiene el smoke de ocho escenarios históricos con dos segundos y respaldo válido.
- Regresiones: doble AUX, sin demanda, apertura sin responsable, reservas, topes cero/ausentes/inválidos, contrato, capacidad AUX >12 h, prioridad verificada por ambos validadores, respaldo al agotarse tiempo, horas exactas +32/+48 e inmovilidad de presencia. No se quitaron tests existentes.
- Playwright local intentado: el entorno impide crear socket Chromium (`Operation not permitted`), antes de abrir páginas. La CI remota debe verificar el navegador; no confundir bloqueo del runtime con aprobación local.

## Pendientes concretos

Para 091 faltan topes eventuales individuales aprobados, política/responsable de apertura compatible y generalización aprobada si hay 3+ AUX. No se corrió un nuevo benchmark real 091. Además quedan pendientes AH2-039 y la definición técnica aprobada de comparabilidad de AH2-040; no se declara que v1 las implemente. La integración UI, el transporte A→B, persistencia/seguridad y publicación siguen pendientes del contrato Work-Claude. Nada de Supabase, Netlify, Prestify, datos laborales o altas reales en esta entrega.
