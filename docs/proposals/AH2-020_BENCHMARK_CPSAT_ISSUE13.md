# PROPUESTA — Benchmark CP-SAT para certificar AH2-020 (Issue #13)

**Estado:** PROPUESTO. Requiere autorización del propietario. **No es productivo.** No se agrega ninguna dependencia a la app, no hay cambios en Supabase ni en Netlify, y no hay gasto.

## 1. Por qué

La «B conjunta» (MASTER AH2-020, aprobada como dirección) es una **heurística**: multi-arranque sobre la búsqueda local de la pasada 1. En 200 escenarios sintéticos mejora sin regresiones frente al motor anterior, pero:

- **Escenario 100:** no se encontró una solución que cumpla las horas y llegue a la cobertura sin prioridad (95,93 % frente a 97,56 %). Tampoco se probó que sea imposible.
- **Escenario 130:** se mejoró de 98,97 % a 99,49 %, pero no se sabe si el 100 % es alcanzable con todas las horas.
- **Cota individual:** prueba imposibilidad **por persona**. No prueba el óptimo global de cobertura, porque hay interacción entre personas: tope de francos por día, demanda compartida y la cascada AUX/eventuales.

Un solver exacto (Google OR-Tools CP-SAT) puede dar, por escenario, el **óptimo** o una **cota superior demostrada** de cobertura sujeta a horas exigibles. Así se mide la brecha real de la heurística.

## 2. Alcance

- **Entrada:** los mismos 200 escenarios de `src/algoritmo/__tests__/fixtures/escenariosSinteticos.ts`, con semilla `20261114`, más la semana 47 anonimizada. Se exportan a JSON con un script de prueba que corre solo con `AH2_EXPORT=1` y no toca datos reales.
- **Modelo (Python, fuera del repo productivo, p. ej. `tools/cpsat/`, sin build de la app):**
  - Variables: por persona, día y slot de 30 min, una booleana «en caja»; por persona y día, la jornada elegida dentro de las candidatas válidas (o el franco).
  - **Restricciones duras:** las mismas del motor y del validador independiente.
    - Composición FULL de 48 h (R1/R3, franco y medio corrido si está activo).
    - PART: jornadas de 4–6 h, 1 franco, ≥ 2 mañanas, descanso de 12 h, tope = min(ficha, perfil).
    - Excepciones por persona.
    - Tope de francos por día.
    - Mínimo de cajeros por franja.
    - Apertura sólo AUX según la configuración.
  - **Horas exigibles como restricción:** cada PART asigna su objetivo, o la cota individual si está demostrada como imposible. FULL: 48 h.
  - **Objetivo:** maximizar la demanda cubierta (cobertura POM de la pasada 1). Desempate: minimizar sobrantes.
  - **AUX/eventuales:** en una primera versión se fija la pasada 2/3 sobre el déficit residual, igual que la cascada. Una segunda versión opcional modela AUX/eventuales en conjunto, para medir cuánto se pierde por la cascada.
- **Salida por escenario:**
  - estado CP-SAT: `OPTIMAL` / `FEASIBLE` / `INFEASIBLE` / `UNKNOWN`;
  - cobertura óptima o cota superior;
  - brecha frente a la solución productiva (`PROD`);
  - tiempo.
  - Toda solución CP-SAT se re-valida con `validarResultadoSemana` (TypeScript) para descartar diferencias de modelado.

## 3. Criterios de aceptación

1. Para cada escenario: «óptimo demostrado» (`OPTIMAL`), «cota demostrada» (`FEASIBLE` + bound) o «sin resultado» (`UNKNOWN`). Nunca se mezclan.
2. Para los escenarios 100 y 130: decir si la cobertura sin prioridad es alcanzable con horas exigibles. Si lo es, guardar la solución como fixture de regresión de la heurística.
3. Informe con la brecha media y máxima `PROD` frente a CP-SAT, y cuántos escenarios tienen brecha > 0,5 pp.
4. Tiempo límite por escenario: 60 s, en 8 hilos. Se informa cuántos no cierran.

## 4. Lo que NO incluye

- No reemplaza al motor productivo ni corre en el navegador ni en Netlify.
- No usa datos reales: solo sintéticos o anonimizados.
- No cambia reglas ni interpretación normativa.
- La adopción productiva de CP-SAT (servidor, costos, latencia) sería una decisión separada (§6.1, tramo E).

## 5. Requisitos y esfuerzo estimado

- Entorno de análisis con Python 3.11 y `ortools` (paquete pip; licencia Apache 2.0). Sin costo de licencias.
- Esfuerzo: 1–2 días para el modelo y la exportación, más 0,5 día para validar contra el validador independiente y el informe.
- Riesgo principal: diferencias de modelado entre CP-SAT y el validador. Se mitiga re-validando cada solución en TypeScript.

## 6. Decisión pedida al propietario

Autorizar o no la ejecución del benchmark offline descrito. Si se autoriza, se registrará en la Issue #13 y en MASTER §9 como evidencia, sin cambiar el comportamiento productivo.
