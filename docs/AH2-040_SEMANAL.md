# AH2-040: regla semanal EVENTUAL ≤ AUX comparable (implementación técnica)

**20/11/2026 · Claude · Laboratorio con datos sintéticos.** No hay merge, despliegue ni datos reales.

- **Autoridad de producto:** MASTER §9, AH2-040, con la ratificación del propietario del 20/11/2026.
- **Continuidad:** primera sección de `docs/CURRENT_WORK.md`.

**Regla aprobada (no se rediscute):**
1. FULL/PART hacen el 100 % de sus horas contractuales en caja.
2. Los AUX tienen prioridad para la demanda residual, manteniendo la supervisión.
3. Los EVENTUAL cubren solo la demanda residual, respetando sus otras funciones habituales.

Además, **ningún EVENTUAL puede acumular más horas-caja SEMANALES que un AUX realmente comparable y habilitado para caja.** P3 y los perfiles de disponibilidad de caja no la sustituyen.

## 1. Resolución técnica de la comparabilidad

Definiciones idénticas en A (`src/algoritmo/ah2040.ts`) y en B (`optimizer/ah2040.py`):

| Símbolo | Definición |
|---|---|
| O(e) | Franjas en que el EVENTUAL **puede** hacer caja: demanda > 0, presencia, disponibilidad acreditada (perfiles de AH2-037), reservas de su función habitual, corte horario y tope individual. |
| K(a) | Franjas en que el AUX **puede** hacer caja sin dejar descubierta la supervisión: demanda > 0, dos AUX presentes y no ser el supervisor designado del día (o apertura con supervisión externa autorizada). Un AUX exclusivamente supervisor tiene K = ∅. Con roles rotativos, sin supervisor fijo, ambos AUX tienen K en las franjas compartidas. |
| **a comparable con e** | **K(a) ≠ ∅ y K(a) ∩ O(e) ≠ ∅.** El AUX está habilitado para caja y compite con el EVENTUAL por al menos una franja con demanda. |

**Restricción (modo `SEMANAL`):** `horasCaja_semana(e) ≤ horasCaja_semana(a)` para **cada** AUX comparable. Sus propiedades:
- **Total semanal**, no por ventana compartida.
- **Contra cada comparable**, sin promedios. Con varios comparables, el resultado efectivo es el mínimo entre ellos.
- **Sin comparable** (turnos sin franja común, o solo AUX supervisores): no hay relación ni se fabrica un tope cero. El caso se informa como `EVENTUAL_SIN_AUX_COMPARABLE`.
- **Se acumula** con la disponibilidad acreditada, las reservas y los topes individuales del EVENTUAL. Ninguno se relaja.
- **Nunca crea inviabilidad**, porque EVENTUAL = 0 siempre es factible. Su costo aparece como faltantes, registrados por franja.

### Cómo la impone cada motor

**Motor B (CP-SAT):**
- Variables de identidad AUX por franja: con roles rotativos, el modelo decide qué AUX queda en caja.
- La relación lineal entra en el mismo orden lexicográfico: faltantes → cobertura ponderada → sobrantes → uso eventual → …
- La extracción del plan respeta la identidad elegida.

**Motor A (heurístico):**
- La caja AUX se fija antes de asignar EVENTUALES y no depende de ellos (AH2-036).
- Con roles rotativos, `balancearIdentidadAux` asigna cada tramo contiguo intercambiable (desde las 09:00) al AUX con menos horas-caja. Es determinístico y no cambia cobertura ni supervisión.
- Después se derivan topes para cada EVENTUAL = mínimo de `caja(a)` entre sus AUX comparables, se vuelve a correr y se comprueba que la caja AUX no cambió.

**Verificadores independientes** (recalculan desde el plan):

| Motor | Verificador | Qué hace |
|---|---|---|
| B | `validator.evaluate` | Agrega `AH2040_SEMANAL:e:a`. |
| A | `auditarEscenario` | Agrega `OP_EVENTUAL_SUPERA_AUX_COMPARABLE` y, en modo SEMANAL, **reemplaza** el bloqueo `POLITICA_EV_COMPARACION_PENDIENTE` por esta verificación. |
| A y B | `verificarAH2040` / `check` | Verificación directa de la relación. |

Sin el modo SEMANAL, el bloqueo anterior se conserva.

## 2. Casos sintéticos y resultados

Base común a los casos:
- un PART de 32 h;
- dos AUX supervisores exclusivos en días alternos (`aux-sA`, `aux-sB`);
- demanda de lunes a sábado de 09 a 22 h;
- corte 22:00 y máximo de 2 bloques.

Cómo reproducirlo:
- B: `python -m optimizer.ah2040_semanal_lab --out results/ah2040_semanal --seconds 10` (semilla 20261119, un worker).
- A: `AH2040_SEMANAL_OUT=<archivo> npx vitest run src/algoritmo/__tests__/ah2040-semanal.test.ts`.

Evidencia:
- `docs/evidencia/ah2040-semanal.csv` (76 filas A/B y estados);
- `docs/evidencia/ah2040-semanal-faltantes-por-franja.csv` (1 153 franjas donde SEMANAL difiere de P0, por motor);
- aliada-optimizer `results/ah2040_semanal/`.

| # | Caso | AUX comparables detectados |
|---|---|---|
| S1 | Turnos coincidentes (AUX y EVENTUAL de 09 a 17, lunes a sábado) | ev-1 ~ aux-t (supervisores excluidos) |
| S2 | Turnos diferentes: AUX de 09 a 14 L–V; ev-1 de 16 a 22; ev-2 de 13 a 21 | ev-2 ~ aux-t (5 h comunes); **ev-1 sin comparable** |
| S3 | Dos AUX con supervisión rotativa (sin supervisor fijo) | ev-1 ~ aux-sA, aux-sB y aux-t |
| S4 | Solo AUX supervisores exclusivos | ninguno: **sin tope cero** |
| S5 | EVENTUAL de 72 h disponibles frente a un AUX de 24 h | ev-1 ~ aux-t |
| S6 | Varios AUX comparables (24 h y 12 h) | ev-1 ~ aux-t y aux-u |
| S7 | Demanda superior a la capacidad (6 cajas) | ev-1 y ev-2 ~ aux-t |
| S8 | Cobertura parcial con perfiles de AH2-037 (reservas y máximo de 30 h) | ev-1 ~ aux-t; ev-2 sin comparable |
| S9 | **Ambigüedad:** una sola hora común (sábado de 13 a 14) | ev-1 ~ aux-t |

**Faltantes en horas, B (CP-SAT) / A:**

| Caso | P0 (sin regla) | **SEMANAL** | Costo de la regla en B | Horas-caja EVENTUAL con SEMANAL (B = A) |
|---|---|---|---|---|
| S1 | 106 / 106 | 106 / 106 | 0 | 48 (= AUX 48) |
| S2 | 93 / 93 | 116 / 116 | +23 | ev-1 36 (sin comparable), ev-2 25 (= AUX 25) |
| S3 | 82 / 84 | 138 / 138 | +56 | 16; cada AUX 16 (identidad repartida) |
| S4 | 130 / 130 | 130 / 130 | 0 | 72 (sin comparable) |
| S5 | 106 / 118 | 154 / 154 | +48 | 24 (= AUX 24) |
| S6 | 94 / 100 | 154 / 154 | +60 | 12 (= mínimo de 24 y 12) |
| S7 | 244 / 248 | 292 / 292 | +48 | 48 + 48 (= AUX 48) |
| S8 | 122 / 122 | 132 / 132 | +10 | ev-1 20 (= AUX), ev-2 30 (su máximo) |
| S9 | 129 / 129,5 | 200 / 200 | +71 | 1 (= AUX 1) |

**Validación:**
- Las 36 corridas B (9 casos × 4 modos) terminaron **OPTIMAL**.
- 0 infracciones en todos los verificadores: regla, validador del motor y disponibilidad. Los 36 planes B se validaron también con los verificadores A.
- O, K y los pares comparables son idénticos en A y B.
- Con la regla, A obtiene **exactamente** la misma cobertura y las mismas horas-caja que CP-SAT en los 9 casos. Sin la regla (P0), A queda hasta 12 h por debajo (S5).
- La caja AUX total nunca cambia: la regla no desplaza AUX, solo reduce horas EVENTUALES.
- El validador A detecta el incumplimiento en un plan P0 que no aplica la regla (S5: 72 h contra 24 h). El validador B también lo detecta (`AH2040_SEMANAL:ev-1:aux-t`).

**Estados del solver.** Presupuesto **determinístico** de CP-SAT por fase (`solve(..., deterministic_time=)`), reproducible con un worker:

| Caso | Presupuesto | Estado | Plan |
|---|---|---|---|
| S11: S7 ampliado a 8 PART, 4 EVENTUALES y demanda 8 | 0,3 | **UNKNOWN** | sin plan: no se presenta horario |
| S11 | 4,0 | **FEASIBLE** (no probado óptimo) | plan con 156,5 h faltantes, válido en A y B |
| S3 | 0,12 | **UNKNOWN** (faltantes OPTIMAL; cobertura ponderada sin terminar) | incumbente válido; lexicográfico incompleto |
| S10: PART de 32 h con máximo de 30 h | — | **INFEASIBLE** | `HORAS_FUERA_PERFIL`: inviabilidad contractual, ajena a la regla |

**OPTIMAL:** las 36 corridas de la matriz. La regla nunca produjo INFEASIBLE.

## 3. Ambigüedad técnica documentada (única)

**Solapamiento mínimo (S9).** Un AUX habilitado para caja que comparte con el EVENTUAL una sola franja con demanda (1 h en la semana) cumple la definición «K(a) ∩ O(e) ≠ ∅». Por eso limita **todo** el total semanal del EVENTUAL a sus horas: 1 h en lugar de 72 h, con +71 h de faltantes. Las dos lecturas técnicas posibles, sobre los mismos datos:

| Lectura | Comparable | S9: EVENTUAL / faltantes (B) | S2 | S8 |
|---|---|---|---|---|
| **SEMANAL (implementada)**: comparte al menos una franja | aux-t | 1 h / 200 h | 116 | 132 |
| PC (más estrecha): todas las oportunidades del EVENTUAL dentro de las del AUX | ninguno | 72 h / 129 h | 93 (igual que P0) | 122 (igual que P0) |
| PT (más amplia): todo AUX con capacidad de caja, haya o no franja común | aux-t | 1 h / 200 h | 127 (limita también a ev-1, sin franja común) | 142 |

**Consecuencias:**
- **PC** vuelve inoperante la regla en todos los casos medidos: con la prioridad AUX por franja nunca hay exceso dentro de la contención.
- **PT** crea los falsos conflictos que el MASTER prohíbe: compara con AUX sin disponibilidad común (S2 ev-1, S8 ev-2).
- **SEMANAL** es la única lectura que impone la regla y además evita esos falsos conflictos.

Lo único abierto es si una superposición **mínima** (S9) debe bastar para la comparabilidad. Todo el texto aprobado no fija ningún umbral, y no se inventó ninguno.

## 4. Limitaciones

- A sigue siendo heurístico. Coincide con B en los 9 casos con la regla, pero sin ella (P0) cubre hasta 12 h menos (S5).
- **Tres o más AUX simultáneos:** siguen bloqueados por `POLITICA_AUX_MULTIPLE`. En S6, los AUX comparables no coinciden entre sí en el tiempo.
- **Identidad AUX en B:** CP-SAT elige la identidad por franja sin penalizar la fragmentación. A asigna por tramos contiguos.
- **Publicación:** el resultado sigue con `publicable=False` en B y la regla está detrás de `comparacion_aux_eventual.modo = "SEMANAL"`. Activarla por defecto en la política v1, la interfaz, el PDF y la persistencia es el paso siguiente y no se hizo.
- Toda la evidencia es sintética: no es un ensayo de la 091.
