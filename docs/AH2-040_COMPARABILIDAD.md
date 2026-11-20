# AH2-040: simultaneidad AUX + EVENTUAL y comparabilidad semanal

**20/11/2026 · Claude · Laboratorio con datos sintéticos.**
- Autoridad: MASTER §9, AH2-036 y AH2-040, incluidas las aclaraciones del propietario del 19 y 20/11/2026.
- Continuidad: primera sección de `docs/CURRENT_WORK.md`.
- **Activación definitiva BLOQUEADA:** ninguna definición de comparabilidad queda homologada.

Lo que ya está aprobado no se rediscute:
- **Prioridad de cobertura:** FULL/PART → AUX → EVENTUAL. Es un orden, no exclusividad temporal.
- **Simultaneidad:** AUX y EVENTUAL pueden atender caja al mismo tiempo cuando el POM lo requiere y la supervisión está garantizada.
- **Totales semanales:** la regla se aplica sobre el total semanal de cada persona.

## 1. Auditoría de simultaneidad AUX + EVENTUAL

**Código revisado:**
- B, motor: `solver.build`. Exige `aux_count + Σ eventuales ≤ residual` y que el EVENTUAL entre solo con la capacidad AUX de esa franja al máximo (`aux_count == aux_max`).
- B, validador: `validator.evaluate`, `ORDEN_RESIDUAL` y `PRIORIDAD_AUX`.
- A, motor: pasada 3, que asigna EVENTUALES sobre el residual después de fijar la caja AUX.
- A, validador: `validadorIndependiente`, `OP_PRIORIDAD_AUX` y `OP_COBERTURA_DUPLICADA`.

**Ninguna de esas piezas exige exclusividad temporal.** No se encontró error de código, así que no hubo que corregir nada para la simultaneidad.

**Pruebas explícitas.** Fixture Z1: cuatro cajas de 11 a 17, dos PART, un AUX elegible (con supervisor de pie) y un EVENTUAL.
- **B (CP-SAT):** en los 5 modos hay franjas con **4 cajas = 2 PART + AUX + EVENTUAL**, sin sobrantes. 0 infracciones en B y en los validadores A.
- **A:** las mismas franjas aparecen en los 5 modos, también con 0 infracciones.
- **Negativos:**

  | Plan construido | B | A |
  |---|---|---|
  | AUX elegible ocioso con el EVENTUAL en caja | `ORDEN_RESIDUAL` | `OP_PRIORIDAD_AUX` |
  | Misma simultaneidad con una caja menos de demanda (sobrante) | — | `OP_COBERTURA_DUPLICADA` |

## 2. Alternativas de comparabilidad evaluadas (sin umbrales numéricos)

Base común a todas:
- K(a) es la capacidad efectiva de caja del AUX: demanda > 0, sin descubrir la supervisión. Un AUX solo supervisor tiene K = ∅.
- O(e) son las oportunidades efectivas del EVENTUAL: demanda > 0, disponibilidad acreditada, reservas, corte y tope.
- La relación es siempre `horasCaja_semana(e) ≤ horasCaja_semana(a)` contra **cada** AUX comparable, sin promedios y sin tope cero cuando no hay comparable.

| Modo | AUX comparable si… |
|---|---|
| `SEMANAL` | K(a) ≠ ∅ y comparte al menos una franja con demanda: K(a) ∩ O(e) ≠ ∅. |
| `OPORTUNIDAD` | Lo de SEMANAL y además \|K(a)\| ≥ oportunidad efectiva semanal de e, que es min(\|O(e)\|, tope(e)). |
| `DIAS` | Lo de SEMANAL y además todo día con oportunidades de e es día con capacidad de caja de a. |
| `PC` | O(e) ⊆ K(a): contención estricta. |

Las cuatro están implementadas en A (`src/algoritmo/ah2040.ts`) y en B (`optimizer/ah2040.py`), y verificadas por los validadores de ambos.

**Corrección hecha en A.** Con roles AUX rotativos, el reparto de identidad (`balancearIdentidadAux`) ahora asigna los tramos intercambiables primero al AUX comparable. Antes repartía también hacia AUX no comparables y bajaba de más el tope del EVENTUAL: en S3 con DIAS, A daba 138 h de faltantes contra 106 h de B. Ahora da 106 h, igual que B. Hay una prueba que lo controla.

### Resultados: faltantes en horas, B / A

12 escenarios × 5 modos. Las 60 corridas B terminaron OPTIMAL, con 0 infracciones en los verificadores A y B y validación cruzada completa.

| Escenario | P0 | SEMANAL | OPORTUNIDAD | DIAS | PC |
|---|---|---|---|---|---|
| S1: turnos coincidentes | 106 / 106 | 106 / 106 | 106 / 106 | 106 / 106 | 106 / 106 |
| S2: AUX L–V 09–14; EVENTUAL L–S 13–21 | 93 / 93 | **116** / 116 | 93 / 93 | 93 / 93 | 93 / 93 |
| S3: supervisión rotativa en días alternos | 82 / 84 | **138** / 138 | 82 / 84 | **106** / 106 | 82 / 84 |
| S4: solo supervisores | 130 / 130 | 130 / 130 | 130 / 130 | 130 / 130 | 130 / 130 |
| S5: AUX 4 h diarias L–S; EVENTUAL 12 h diarias | 106 / 118 | **154** / 154 | 106 / 118 | **154** / 154 | 106 / 118 |
| S6: dos AUX que se reparten la semana | 94 / 100 | **154** / 154 | 94 / 100 | 94 / 100 | 94 / 100 |
| S7: demanda superior | 244 / 248 | **292** / 292 | 244 / 248 | **292** / 292 | 244 / 248 |
| S8: perfiles; AUX L–V | 122 / 122 | **132** / 132 | 122 / 122 | 122 / 122 | 122 / 122 |
| S9: AUX solo el sábado de 13 a 14 | 129 / 129,5 | **200** / 200 | 129 / 129,5 | 129 / 129,5 | 129 / 129,5 |
| N1: misma disponibilidad (48 h), distinta demanda | 116 / 116 | **120** / 120 | **120** / 120 | **120** / 120 | 116 / 116 |
| N2: AUX de jornada completa L–S frente a EVENTUAL de 72 h | 82 / 84 | **106** / 106 | 82 / 84 | **106** / 106 | 82 / 84 |
| Z1: simultaneidad con cuatro cajas | 44 / 50 | **68** / 68 | 44 / 50 | **68** / 68 | 44 / 50 |

**En negrita:** la relación limita al EVENTUAL. En todos esos casos A y B coinciden exactamente.

**Diferencias A/B fuera de la negrita:** aparecen solo donde el EVENTUAL no tiene límite. Ahí A cubre hasta 12 h menos, porque es una heurística.

**La caja AUX total nunca cambia.** Ninguna alternativa desplaza AUX.

## 3. Qué relaciones son válidas y cuáles son artificiales

**Contraste con relaciones ratificadas.** Estos escenarios muestran relaciones que la regla ratificada exige:

| Escenario | Qué muestra | Lectura |
|---|---|---|
| **N1** | Misma disponibilidad efectiva (48 h). El EVENTUAL obtiene 48 h y el AUX 44 h porque la demanda está en la tarde. | La equidad ratificada exige limitarlo. **PC no impone nada** (falta 4 h de equidad); además, en ningún escenario cambia la cobertura frente a P0. |
| **N2, S7, Z1** | AUX de jornada completa todos los días del EVENTUAL. El EVENTUAL tiene más horas disponibles (72 h contra 48 h). | La ratificación del 20/11 dice que la relación se mide sobre el **total semanal, no solo sobre ventanas coincidentes**. **OPORTUNIDAD lo exime** por tener más disponibilidad y deja 72 h contra 48 h. Además, cualquier EVENTUAL con disponibilidad declarada amplia escaparía a la regla. |

**Conclusión objetiva:** PC y OPORTUNIDAD contradicen relaciones exigidas por la regla ratificada. Quedan descartadas por evidencia y siguen implementadas solo para reproducir la demostración.

**Finalistas: SEMANAL y DIAS.** Coinciden en S1, S4, S5, S7, N1, N2 y Z1. Difieren solo en los casos donde **el AUX tiene capacidad de caja en una parte de los días del EVENTUAL:**

| Escenario | SEMANAL | DIAS |
|---|---|---|
| **S9** (AUX solo el sábado de 13 a 14) | Compara: EVENTUAL 1 h, **+71 h de faltantes**. Una sola franja no demuestra equivalencia de disponibilidad (aclaración del propietario). | No compara: sin pérdida. **Resuelve S9 sin umbral numérico.** |
| **S2 / S8** (AUX L–V; EVENTUAL L–S) | Compara: +23 / +10 h. | No compara, solo porque el EVENTUAL además trabaja el sábado: EVENTUAL 48 h contra AUX 25 h, y 30 h contra 20 h. |
| **S6** (dos AUX que se reparten la semana: L–X y J–S) | Compara con ambos: EVENTUAL 12 h, +60 h. | No compara con ninguno: EVENTUAL 72 h, por encima de los dos. |
| **S3** (AUX diario y dos supervisores rotativos en días alternos) | Compara con los tres: EVENTUAL 16 h, +56 h. | Solo con el AUX diario: EVENTUAL 48 h, +24 h. |

## 4. Caso concreto pendiente (activación bloqueada)

**Pregunta única:**

> Cuando un AUX tiene capacidad de caja solo en **parte de los días** en que el EVENTUAL puede atender, ¿es «realmente comparable»?

**Si la respuesta es «sí»**, la regla es SEMANAL. Costo y efecto:
- S9 pierde 71 h por una sola hora en común.
- S6 limita al EVENTUAL al menor de los AUX parciales.
- S3 incluye a los supervisores rotativos.

**Si la respuesta es «no»**, la regla es DIAS. Costo y efecto:
- S9 queda resuelto.
- Un EVENTUAL que solo agrega días fuera de los del AUX (S2, S8) o que combina AUX parciales (S6) queda sin comparación.

No hay un criterio objetivo que elija entre las dos sin decidir esta pregunta. Agregar un número de días u horas mínimo sería un umbral inventado.

**Estado del código:**
- Las dos alternativas están implementadas y probadas en A, B y ambos validadores.
- Se activan solo por pedido, con `comparacion_aux_eventual.modo`.
- El bloqueo `POLITICA_EV_COMPARACION_PENDIENTE` sigue vigente fuera de esos modos.
- La activación definitiva en la política v1 queda **bloqueada** hasta la respuesta del propietario.

**Reproducción:**
- B: `python -m optimizer.ah2040_comparabilidad_lab --out results/ah2040_comparabilidad --seconds 10`.
- A: `AH2040_COMP_OUT=<archivo> npx vitest run src/algoritmo/__tests__/ah2040-comparabilidad.test.ts`.

**Evidencia:**
- `docs/evidencia/ah2040-comparabilidad.csv` (120 filas A y B, con relaciones y simultaneidad por escenario y modo);
- aliada-optimizer `results/ah2040_comparabilidad/`.

---

## 5. Evaluación de DIAS con duración efectiva y capacidad real de caja (20/11/2026, segunda ronda)

**Pedido:** tomar DIAS como candidato preferido y comprobar que compartir los mismos días no compare jornadas muy distintas. Además:
- conservar los totales semanales individuales;
- no inventar umbrales;
- separar la cobertura perdida por la regla de la cobertura imposible.

**Alternativas agregadas** en A, B y ambos validadores, con las mismas entradas y restricciones:

| Modo | AUX comparable / relación |
|---|---|
| `DIAS` | Lo de SEMANAL y además todo día con oportunidades del EVENTUAL tiene capacidad de caja del AUX. |
| `DIAS_CAPACIDAD` | DIAS y además \|K(a)\| ≥ oportunidad efectiva semanal del EVENTUAL = min(\|O(e)\|, tope individual). Compara la capacidad efectiva de cada persona; no hay número fijo. |
| `SATURACION` | Comparables por DIAS; relación `min(caja(e), \|K(a)\|) ≤ caja(a)`. El EVENTUAL solo puede superar a un AUX comparable que ya usó toda su capacidad efectiva. En CP-SAT se modela con una variable mínimo. |

**Escenarios nuevos:**
- **D1:** mismos días, jornada muy distinta. AUX de caja de 13 a 14 de lunes a sábado (6 h); EVENTUAL de 09 a 21 de lunes a sábado.
- **N3:** AUX corto con capacidad ociosa. AUX de 09 a 13 con demanda baja a la mañana, ya cubierta por dos PART; EVENTUAL de 09 a 21.

### 5.1 Descomposición del faltante (CP-SAT, horas)

Por cada escenario el faltante se separa en tres partes (`descomposicion-b.json`, `docs/evidencia/ah2040-comparabilidad-perdida-por-franja.csv`):
- **sin personal:** cota estructural, demanda que supera a todas las personas que podrían estar en caja;
- **otras reglas:** contratos y demás reglas obligatorias (todo P0, salvo lo imposible);
- **perdido por la definición:** modo − P0, franja por franja.

| Escenario | Sin personal | Otras reglas | SEMANAL | DIAS | **DIAS_CAPACIDAD** | SATURACION | OPORTUNIDAD | PC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 coincidentes | 60 | 46 | 0 | 0 | **0** | 0 | 0 | 0 |
| S2 AUX L–V, EV L–S | 47 | 46 | 23 | 0 | **0** | 0 | 0 | 0 |
| S3 rotativos | 36 | 46 | 56 | 24 | **0** | 0 | 0 | 0 |
| S4 solo supervisores | 84 | 46 | 0 | 0 | **0** | 0 | 0 | 0 |
| S5 AUX 4 h diarias | 60 | 46 | 48 | 48 | **0** | 0 | 0 | 0 |
| S6 AUX repartidos | 48 | 46 | 60 | 0 | **0** | 0 | 0 | 0 |
| S7 demanda superior | 198 | 46 | 48 | 48 | **0** | 0 | 0 | 0 |
| S8 perfiles | 46 | 76 | 10 | 0 | **0** | 0 | 0 | 0 |
| S9 una hora | 83 | 46 | 71 | 0 | **0** | 0 | 0 | 0 |
| **N1 misma disponibilidad** | 90 | 26 | 4 | 4 | **4** | 4 | 4 | 0 |
| N2 AUX jornada completa | 36 | 46 | 24 | 24 | **0** | 0 | 0 | 0 |
| Z1 cuatro cajas | 0 | 44 | 24 | 24 | **0** | 0 | 0 | 0 |
| **D1 jornada muy distinta** | 78 | 46 | 66 | **66** | **0** | 0 | 0 | 0 |
| **N3 AUX corto ocioso** | 60 | 52 | 28 | **28** | **0** | 28 | 0 | 0 |

**Validación:**
- Las 98 corridas B (14 escenarios × 7 modos) terminaron OPTIMAL, con 0 infracciones en los validadores B y A y validación cruzada completa.
- La descomposición cierra exactamente: faltante = sin personal + otras reglas + perdido.
- La prioridad AUX nunca se relajó. La caja AUX no disminuye en ningún modo. En N3, CP-SAT la **aumenta** (16 → 20 h) reacomodando jornadas PART.
- **A vs B:** donde la relación limita al EVENTUAL, A = B. La única excepción medida es ese reacomodo de PART en N3, que A no hace porque fija la caja AUX antes de asignar EVENTUALES.

### 5.2 Lectura

| Modo | Conclusión |
|---|---|
| DIAS | **Falla la comprobación pedida.** En D1 compara una jornada de caja de 1 h diaria con 12 h diarias, porque comparten los días, y pierde 66 h. En N3 compara 4 h con 12 h y pierde 28 h. Es un artefacto del mismo tipo que S9. |
| SATURACION | Resuelve D1 pero no N3: un AUX corto con capacidad ociosa sigue limitando a un EVENTUAL de jornada larga. |
| **DIAS_CAPACIDAD** | Resuelve D1, N3 y S9 y mantiene la relación de disponibilidad equivalente (N1). Ninguna de sus pérdidas es un artefacto, y no usa umbrales: compara la capacidad efectiva propia de cada persona. |
| OPORTUNIDAD | Coincide con DIAS_CAPACIDAD en todos los escenarios: con capacidad suficiente, el requisito de días rara vez decide. Se conserva DIAS_CAPACIDAD porque además exige compartir todos los días del EVENTUAL. |
| PC | Sigue descartada: no limita ni en N1. |

### 5.3 Recomendación técnica definitiva

**Homologar AH2-040 con DIAS_CAPACIDAD.** Un AUX es *realmente comparable* con un EVENTUAL si se cumplen las tres condiciones:
1. Puede atender caja sin descubrir la supervisión: K(a) ≠ ∅. Esto excluye al AUX que solo supervisa.
2. Tiene capacidad de caja **todos los días** en que el EVENTUAL tiene oportunidades.
3. Su capacidad efectiva semanal de caja es **al menos** la oportunidad efectiva semanal del EVENTUAL, es decir, la disponibilidad acreditada menos las reservas, con su tope individual.

Para cada AUX comparable rige `horasCaja_semana(EVENTUAL) ≤ horasCaja_semana(AUX)`, sobre el total y sin promedios. Si no hay AUX comparable, no se aplica ningún tope cero.

### 5.4 Ambigüedad material residual (activación bloqueada)

DIAS_CAPACIDAD **no compara** a un EVENTUAL cuya oportunidad efectiva semanal supera la capacidad de todo AUX de los mismos días. Casos N2, S5, S7 y Z1: un AUX de jornada completa (48 h) frente a un EVENTUAL con 72 h acreditadas y sin tope. En esos casos el EVENTUAL puede superar al AUX; con DIAS, en cambio, quedaría limitado (24–48 h de pérdida por escenario).

No existe criterio sin umbral que separe N2 (8 h frente a 12 h diarias) de D1 (1 h frente a 12 h): solo difieren en grado. Por eso la pregunta exacta para el propietario es una sola:

> **¿Una mayor oportunidad efectiva semanal del EVENTUAL vuelve no comparable a un AUX de los mismos días?**
> - **Sí:** DIAS_CAPACIDAD (recomendada). Sin artefactos D1, N3 ni S9. La carga del EVENTUAL queda acotada por su perfil de AH2-037: tope y reservas acreditadas. Declarar un tope ≤ la capacidad del AUX lo vuelve comparable.
> - **No:** DIAS, aceptando las pérdidas de D1 (66 h) y N3 (28 h), que provienen de comparar jornadas de duración muy distinta.

La activación definitiva sigue **bloqueada** hasta esa respuesta. Las tres definiciones (DIAS, DIAS_CAPACIDAD, SATURACION) están implementadas, verificadas y se activan solo por pedido (`comparacion_aux_eventual.modo`).
