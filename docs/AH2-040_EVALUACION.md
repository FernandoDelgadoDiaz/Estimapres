# AH2-040 — Evaluación experimental de «EVENTUAL ≤ AUX comparable»

**20/11/2026 · Claude · Laboratorio sintético. Ninguna alternativa queda aprobada ni se vuelve publicable.**
- Autoridad de producto: MASTER §9 (AH2-036…AH2-040, AH2-040-P1 y AH2-040-P3).
- Continuidad: primera sección de `docs/CURRENT_WORK.md`.

## 1. Qué se comparó

Las entradas y restricciones son las mismas en los dos motores: **A** (heurístico, Estimapres) y **B** (Google OR-Tools CP-SAT 9.15, aliada-optimizer). Las definiciones son idénticas en `src/algoritmo/ah2040.ts` y `optimizer/ah2040.py`.

| Símbolo | Definición |
|---|---|
| O(e) | Oportunidades de caja del EVENTUAL e. Son las franjas que cumplen todo lo siguiente: demanda > 0; desde 09:00 y antes del corte; disponible; sin reserva sectorial; tope explícito distinto de 0. |
| K(a) | Capacidad **efectiva** de caja del AUX a: franjas con demanda > 0 en que a puede atender caja sin dejar la supervisión descubierta. Exige dos AUX presentes con a no designado supervisor, o una apertura con supervisión externa declarada. **Un AUX exclusivamente supervisor tiene K = ∅** y nunca es comparable. |
| Kd(a) | Capacidad **determinada**: franjas de K(a) en que a es el **único** AUX que puede atender caja. Con dos AUX intercambiables (sin supervisor designado) la franja no se atribuye a nadie en particular. |

| Modo | Relación semanal individual impuesta |
|---|---|
| P0 | Ninguna. Solo rige lo ya implementado: prioridad AUX por franja (AH2-036) y tope explícito opcional. |
| **P1** (Work) | Pares (e, a) elegidos explícitamente, válidos si O(e) ⊆ K(a): `caja(e) ≤ caja(a)`. Un par no contenido se informa y no se impone. |
| **P2** (pedido del propietario) | Automática: a* = el AUX con mayor \|K(a) ∩ O(e)\| > 0, desempatando por mayor \|K(a)\| y luego por id: `caja(e) ≤ caja(a*)`. |
| P2E | P2 estricta: `caja(e) ≤ caja(a)` para **todo** a con solapamiento. Mide el costo de la rigidez. |
| **P3** (alternativa nueva) | Ventana compartida con capacidad determinada: W = Kd(a) ∩ O(e); para todo a con W ≠ ∅, `caja_W(e) ≤ caja_W(a)`. |

**Cómo se impone cada modo:**
- **B:** variables de identidad AUX por franja (solo en modo experimental) y restricciones lineales dentro del mismo modelo lexicográfico: faltantes → cobertura ponderada → sobrantes → uso eventual → …
- **A:** la pasada 3 corre después de fijar la caja AUX, que no depende de los eventuales. A deriva un tope por eventual (P1, P2, P2E) o reservas por franja (P3, condición suficiente). Después vuelve a correr y comprueba que la caja AUX no cambió.
- **Verificación:** el verificador de cada repositorio recalcula O, K y las horas desde el plan. Cada motor se valida con **ambos** verificadores: A valida los planes de B y B valida los de A.

## 2. Casos sintéticos (8)

**Base común a todos los casos:**
- un PART de 32 h;
- supervisión AUX de 09:00 a 22:00 los 7 días, con dos AUX en días alternos (`aux-sA`, `aux-sB`). Nunca coinciden entre sí, así que su capacidad de caja propia es nula, y respetan el descanso de 12 h;
- demanda de lunes a sábado;
- corte de caja eventual a las 22:00 y máximo dos bloques diarios.

| # | Caso |
|---|---|
| 1 | AUX y EVENTUAL totalmente coincidentes (09–17, lunes a sábado). |
| 2 | Parcialmente coincidentes: EVENTUAL 13–21 de lunes a sábado; AUX 09–17 de lunes a viernes (sábado sin AUX de caja). |
| 3 | Sin coincidencia: EVENTUAL 17–22; AUX 09–17. |
| 4 | Dos AUX con roles intercambiables (sin supervisor de jornada completa): uno supervisa y el otro atiende caja, sin rol fijo. |
| 5 | Solo AUX supervisores (capacidad de caja nula) y un EVENTUAL. |
| 6 | Un EVENTUAL con tope explícito de 8 h y otro sin tope. |
| 7 | Disponibilidades diversas y demanda elevada (4 cajas), tres EVENTUALES. |
| 8 | Rigidez: AUX de caja solo el lunes 09–13; EVENTUAL 09–21 de lunes a sábado. |

Reproducción:
- B: `python -m optimizer.ah2040_lab --out results/ah2040 --seconds 10` (semilla 20261119, un worker).
- A: `AH2040_OUT=<archivo> npx vitest run src/algoritmo/__tests__/ah2040-comparacion.test.ts`.

Las entradas y los planes de ambos motores están en aliada-optimizer `results/ah2040/` y en los fixtures de A. La tabla completa por caso, modo y motor está en `docs/evidencia/ah2040-comparacion.csv` (80 filas): cobertura, faltantes, sobrantes, horas-caja de cada AUX y EVENTUAL, horas sectoriales preservadas, relaciones e infracciones.

## 3. Resultados

**Estado de las corridas:**
- B: las 40 corridas terminaron en `OPTIMAL`, con un máximo de 1,25 s y 42 s en total.
- **0 infracciones** en los dos validadores (relación del modo y reglas existentes), en ambos motores y en la validación cruzada.
- O/K idénticas en A y B.
- Ningún modo produjo **INFEASIBLE**: la relación siempre admite EVENTUAL = 0, así que su costo se manifiesta como **pérdida de cobertura**, no como inviabilidad.

**Faltantes totales en los 8 casos (horas-caja):**

| Modo | A | Δ A vs P0 | B (CP-SAT) | Δ B vs P0 | Casos con pérdida (A / B) | Horas-caja EV totales (A / B) |
|---|---:|---:|---:|---:|---|---|
| P0 | 1 015 | 0 | 1 013 | 0 | — / — | 473 / 475 |
| P1 | 1 048,5 | **+33,5** | 1 013 | 0 | 4 / — | 439,5 / 475 |
| P2 | 1 130,5 | **+115,5** | 1 097 | **+84** | 2, 4, 7, 8 / 2, 7, 8 | 357,5 / 391 |
| P2E | 1 183 | +168 | 1 181 | +168 | 2, 4, 7, 8 / 2, 4, 7, 8 | 305 / 307 |
| **P3** | 1 015 | **0** | 1 013 | **0** | — / — | 473 / 475 |

**Casos donde las alternativas difieren** (faltantes en horas, B / A):

| Caso | P0 | P1 | P2 | P2E | P3 | Lectura |
|---|---|---|---|---|---|---|
| 2 parciales | 114 / 114 | 114 / 114 | 122 / 122 | 122 / 122 | 114 / 114 | P2 limita el EV a las 40 h del AUX aunque el **sábado no hay ningún AUX de caja**: −8 h de cobertura. |
| 4 roles intercambiables | 106 / 106 | 106 / **139,5** | 106 / **139,5** | 138 / 140 | 106 / 106 | Con roles rotativos, P1 y P2 dependen de **qué AUX fue a caja**. B lo elige a favor del par; la heurística A no, y pierde 33,5 h. |
| 7 disponibilidades | 131 / 131 | 131 / 131 | 139 / 139 | **191 / 191** | 131 / 131 | P2E compara con un AUX que solo trabaja el sábado: −60 h. |
| 8 rigidez | 126 / 128 | 126 / 128 | **194 / 194** | 194 / 194 | 126 / 128 | El AUX de caja trabaja 4 h; P2 deja al EVENTUAL en 4 h: **−68 h** (cobertura 46,2 % → 17,1 %). |

En los casos 1, 3, 5 y 6 todos los modos coinciden:
- caso 1: el EVENTUAL ya no supera al AUX;
- casos 3 y 5: no hay AUX comparable, así que no se fabrica un tope cero;
- caso 6: el tope explícito de 8 h se respeta en todos los modos y el eventual sin tope no queda en cero.

**Hallazgo central (verificado en ambos motores):** ningún modo aumentó jamás el total de horas-caja AUX (comparación fila por fila contra P0). Las relaciones semanales P1, P2 y P2E **solo quitan horas a los EVENTUALES** en franjas donde ningún AUX podía atender caja. No transfieren trabajo a los AUX: cada hora quitada es una hora de demanda sin cubrir.

**Por qué P3 no cuesta cobertura:** la prioridad AUX por franja de AH2-036 ya obliga a que, si un EVENTUAL atiende caja en una franja, toda la capacidad AUX de esa franja esté en uso. Por eso, en la ventana donde un AUX tiene capacidad determinada, el EVENTUAL nunca puede superarlo. P3 convierte esa propiedad en una **garantía individual verificable**: si se rompe, ambos validadores la detectan. La prueba con infracción construida, en la que un AUX deja caja mientras el EVENTUAL sigue, da exceso de 2 h en A y en B.

## 4. Recomendación técnica única

**Aprobar AH2-040 con la definición P3 como regla obligatoria (DEBE), sobre la prioridad AUX por franja de AH2-036, más transparencia semanal individual obligatoria.**

1. **DEBE (por franja, ya implementado):** el EVENTUAL solo atiende caja en franjas con demanda residual después de usar toda la capacidad AUX disponible sin descubrir la supervisión.
2. **DEBE (individual, P3):** para cada EVENTUAL y cada AUX con capacidad de caja determinada en las mismas franjas, las horas-caja del EVENTUAL en esa ventana compartida no superan las del AUX. No se comparan:
   - AUX exclusivamente supervisores;
   - AUX sin disponibilidad comparable;
   - franjas con roles intercambiables, en las que la regla por franja ya asegura un AUX en caja.

   Sin pares manuales ni promedios.
3. **Transparencia obligatoria por persona** en la propuesta y el PDF:
   - horas-caja semanales de cada AUX y cada EVENTUAL;
   - horas del EVENTUAL dentro y fuera de las ventanas compartidas con AUX;
   - horas sectoriales preservadas.

   Si un EVENTUAL supera en total a un AUX, se muestra que esas horas corresponden a franjas sin capacidad AUX (sábado, noche, AUX supervisando solo).
4. **Protección de reposición/maestranza:** con el tope semanal individual explícito y las reservas sectoriales de AH2-037, configurados por sucursal. Es la herramienta correcta para limitar horas eventuales **aunque no haya AUX**. No hay default de 12 h.

**Ventajas:**
- costo de cobertura nulo en los 8 casos y en los dos motores;
- independiente de la heurística (A y B coinciden);
- sin carga manual de pares;
- excluye automáticamente al supervisor exclusivo;
- verificable por individuo y por franja;
- sin promedios.

**Riesgos y límites:**
- P3 **no limita** las horas de un EVENTUAL en franjas sin capacidad AUX. Si el propietario quiere ese límite, debe expresarse como tope explícito o reserva (decisión por sucursal), no como comparación con un AUX ausente.
- Casos de 3 o más AUX simultáneos: siguen pendientes (`POLITICA_AUX_MULTIPLE`). K y Kd solo cubren uno o dos AUX presentes.
- Evidencia **sintética**: no es benchmark de la 091 ni horario operativo.

**Consecuencias si en cambio se aprueba P1 o P2:**
- **P1:** no reduce el uso eventual en ningún caso donde la prioridad por franja ya actúa. Requiere elegir pares a mano. Con roles rotativos su resultado depende del motor (−33,5 h en A).
- **P2:** cuesta 84 h (B) a 115,5 h (A) en los 8 casos, hasta 68 h en un solo caso, sin aumentar horas AUX.

## 5. Pendiente de decisión del propietario

1. Aprobar o rechazar AH2-040-P3 (MASTER, estado PROPUESTO).
2. Si se quiere un límite semanal del EVENTUAL independiente de los AUX: fijar topes y reservas por sucursal (AH2-037), con valores aprobados para la 091.
3. Generalizar a 3 o más AUX.
4. Mientras no se apruebe, la política v1 sigue **no publicable**: sin tope explícito, ambos motores conservan `POLITICA_EV_COMPARACION_PENDIENTE` y no calculan fuera del modo experimental.
