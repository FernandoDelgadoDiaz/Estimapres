# BENCH-01: Google OR-Tools CP-SAT (OFFLINE) — Issue #13

**Estado: prototipo experimental en rama aislada. NO ES EL MOTOR PRODUCTIVO.**
No hay API, servidor, conexión con Supabase, credenciales, migraciones ni cambios de Netlify.
La app sigue usando su motor TypeScript. No publicar horarios generados aquí.

## Alcance exacto

Este primer modelo CP-SAT optimiza *conjuntamente* a los cajeros FULL y PART para
**7 días × 30 medias horas** (08:00–23:00), respetando el catálogo actual:

- FULL: exactamente 48 h, un franco, ≥2 mañanas, 3 jornadas de 9 h,
  2 de 8 h, 1 de 5 h, y **exactamente 2 cortadas** de 9/8 h.
  Cortadas con separación ≥4 h; R4 de medio franco contiguo opcional.
- PART: un franco, ≥2 mañanas, seis jornadas de 4–6 h; máximo del
  contrato y objetivo exacto cuando está informado.
- Descanso ≥12 h entre jornadas consecutivas; también respecto del domingo
  previo **si** se incluye \`fin_domingo_anterior\` por ID.
- Excepciones: franco fijo, entrada/salida limitada, siempre cierre, solo
  matutino o nocturno; límite conjunto de francos.
- Apertura con AUX: evita poner FULL/PART antes de 09:00 cuando R1 está ON.
- Objetivo lexicográfico acotado: menor déficit ponderado FULL/PART,
  luego menor sobrante FULL/PART, luego preferencias blandas de rotación.

No modela todavía la **optimización conjunta de AUX y eventuales**,
la supervisión R1–R3, ausencias de múltiples semanas, equidad mensual integral
ni la semántica completa del validador TypeScript. **Un estado OPTIMAL certifica
solo el subproblema FULL/PART descrito**, nunca el óptimo de Aliada completa.

Este prototipo usa el objetivo de horas PART como restricción exacta: si no es
factible con las reglas, responde INFEASIBLE y no relaja horas silenciosamente.
La solución productiva puede devolver un borrador con horas parciales; comparar
esas soluciones como si fueran equivalentes sería incorrecto.

## Reproducir (sin producción)

Python 3.11 y la versión fija de OR-Tools de \`requirements.txt\`:

\`\`\`bash
python -m venv .venv-cpsat
.venv-cpsat/bin/python -m pip install -r tools/cpsat/requirements.txt
.venv-cpsat/bin/python -m unittest discover -s tools/cpsat -p 'test_*.py' -v
\`\`\`

En Windows, reemplazar \`.venv-cpsat/bin/python\` por
\`.venv-cpsat\\Scripts\\python.exe\`.

**Generación OPT-IN de casos sintéticos desde el código existente:**

\`\`\`bash
AH2_EXPORT_CPSAT=1 npx vitest run src/algoritmo/__tests__/cpsat.export.test.ts
.venv-cpsat/bin/python tools/cpsat/solver.py tools/cpsat/fixtures/semana47-sintetica.json --segundos 60 --salida tools/cpsat/resultados.json
\`\`\`

El exportador incluye 8 escenarios ficticios: semana 47 (demanda 406
horas-caja, sin personal real), dotación -1 y -2, solo mañanas, franco fijo,
pico extremo y escenarios 100/130. Extrae también una referencia del motor
productivo y el número de infracciones registradas por su validador.

**Privacidad:** fixtures y resultados se ignoran con \`.gitignore\`.
No usar datos reales ni subir roster, horarios individuales o PDFs reales.
El exportador no hace lecturas ni escrituras de Supabase.


**Validación cruzada (recién implementada):** en el benchmark se reutilizan las
pasadas AUX/eventuales y `validarResultadoSemana` de Aliada para cada solución
factible devuelta por CP-SAT. Como el submodelo es parcial, esto verifica la
compatibilidad de candidatos, **no** la optimalidad del horario completo.

```bash
.venv-cpsat/bin/python tools/cpsat/solver.py tools/cpsat/fixtures/*.json --segundos 8 --salida tools/cpsat/resultados.json
AH2_VALIDATE_CPSAT=1 npx vitest run src/algoritmo/__tests__/cpsat.validate.test.ts
```

**CI #4, 16/11/2026:** 6 pruebas Python y exportación de 8 fixtures aprobadas.
Tres candidatos disponibles pasaron la validación TypeScript con cero
violaciones. Con 8 s por escenario: 2 FEASIBLE, 1 OPTIMAL parcial, 1 INFEASIBLE,
4 UNKNOWN. En la cobertura *final* tras AUX/EV, escenario 100 mejoró +2,44 pp;
dotación -2 empeoró -7,51 pp; solo mañanas, pese al óptimo parcial, empeoró
-2,09 pp. Estos resultados impiden recomendar reemplazar el motor actual y
muestran que falta optimización conjunta de AUX/EV.

## Lectura de resultados

- \`OPTIMAL\`: óptimo demostrado **dentro del modelo y objetivo implementado**.
- \`FEASIBLE\`: solución encontrada, prueba de optimalidad pendiente.
- \`INFEASIBLE\`: las restricciones modeladas son incompatibles.
- \`UNKNOWN\`: no se encontró solución ni prueba concluyente a tiempo.
- \`brecha_absoluta_objetivo\`: diferencia de la función objetivo y su cota
  (no es un porcentaje de cobertura).
- \`motor_actual_solo_cajeros\` y \`metricas_cajeros\`: datos comparables SOLO
  dentro de FULL/PART. No confundir con cobertura total tras AUX/eventuales.

La API de OR-Tools distingue FEASIBLE de OPTIMAL:
https://github.com/google/or-tools/blob/stable/ortools/sat/docs/troubleshooting.md

## Gates pendientes (NO apto para sustituir producción)

1. Validar en CI que CP-SAT instala, ejecuta y pasa unittest.
2. Exportar los 8 escenarios sintéticos y publicar métricas reales, tiempo,
   estado y cotas; nunca fabricar resultados no ejecutados.
3. Convertir cada jornada CP-SAT a formato de Aliada y ejecutar
   \`validarResultadoSemana\` sobre el resultado completo. Diferencia de modelo
   implica rechazo, no aceptación automática.
4. Modelar AUX/eventuales, supervisión y equidad de varias semanas, y
   definir la función objetivo de negocio con el propietario.
5. Un PR independiente y autorización **expresa** serían necesarios para
   cualquier integración de infraestructura, despliegue o cambio de motor.

La Issue #13 registra los resultados y la decisión posterior.
