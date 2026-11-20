# Disponibilidad efectiva de caja de EVENTUALES — laboratorio

**20/11/2026 · Claude · Solo datos sintéticos.** Nada queda homologado, publicable ni aplicado a una sucursal.

- **Autoridad de producto:** MASTER §9 (AH2-036, AH2-037, AH2-040, AH2-040-P1 y AH2-040-P3).
- **Aclaración del propietario (19/11/2026):** EVENTUAL no implica reposición, maestranza ni un puesto específico; puede provenir de cualquier función de la sucursal.
- **Continuidad:** primera sección de `docs/CURRENT_WORK.md`.

P3 sigue siendo una **propuesta técnica, no aprobada**. Su costo de cobertura cero **no** protege la carga semanal de un EVENTUAL. Esa protección viene de la disponibilidad efectiva descrita aquí.

## 1. Qué se implementó (A y B, definiciones idénticas)

| Pieza | A (Estimapres) | B (aliada-optimizer) |
|---|---|---|
| Contrato, resolución por semana y sucursal, y compilación | `src/algoritmo/disponibilidadCajaEventual.ts` | `optimizer/ev_caja.py` |
| Compilación automática al calcular | `ejecutarAlgoritmo` (orquestador) | `domain.validate_input` |
| Verificador independiente, reporte por persona y análisis EVENTUAL > AUX | mismo módulo | mismo módulo |
| Modo de medición PT (límite semanal estricto) | `ah2040.ts` | `ah2040.py` |
| Laboratorio y pruebas | `__tests__/ev-caja-disponibilidad.test.ts` | `optimizer/ev_caja_lab.py`, `tests/test_ev_caja.py` |

### 1.1 Disponibilidad efectiva, distinta de la presencia laboral

La presencia laboral se mantiene en el campo existente `disponibilidad_eventual`, que el adaptador construye desde `horarioSemanal`.

La disponibilidad **para caja** se declara en `disponibilidad_caja_eventual`. Es una lista de perfiles por persona y sucursal, versionados por vigencia (`vigenciaDesde` / `vigenciaHasta`). Cada perfil puede declarar:

| Campo | Significado |
|---|---|
| `acreditacion` | `NO_ACREDITADA`, `PRESENCIA_MENOS_RESERVAS` o `TODA_LA_PRESENCIA`. Esta última se declara explícitamente, nunca se infiere. |
| `fuente` | Quién o qué acredita la disponibilidad. Obligatoria para acreditar. |
| `reservas` | Ventanas por día de tiempo fijo de **la función habitual de la persona**, sea cual sea. No hay rótulos de sector ni puestos: un campo `sector`, `puesto` o similar se rechaza. |
| `horasFuncionHabitualMinimas` | Tiempo flexible de esa función en la semana. |
| `maxCajaHoras` | Máximo semanal opcional de caja. |
| `horasContractuales` | Dato informativo. |

**Compilación sobre los mecanismos existentes, sin duplicarlos:**
- las reservas se agregan, por unión, a `reservas_sector_eventual`;
- el tope efectivo pasa a `max_caja_eventual_slots` y es el **mínimo** entre:
  - el tope previo;
  - el máximo declarado;
  - presencia − función mínima;
  - 0 cuando la disponibilidad no está acreditada.

Las restricciones de ambos motores y los validadores existentes ya imponen esos dos campos. No hay restricciones nuevas paralelas.

**Reutilización semanal:** la misma lista de perfiles sirve semana tras semana. Cada semana se resuelve la versión vigente y la presencia de esa semana. El caso 2 lo prueba: una nueva versión de reservas desde el 30/11 y otra presencia, sin recargar nada.

La adaptación de la interfaz al motor ya traduce los identificadores de la interfaz a los del motor. No hay persistencia en Supabase: eso queda pendiente de autorización.

### 1.2 Validaciones y diagnósticos

Las formas inválidas lanzan error: versión, acreditación desconocida, horas que no son múltiplo de 0,5 o fuera de 0–84, ventanas invertidas, vigencia invertida o campos no previstos.

El contenido semántico se informa como diagnóstico:

| Código | Nivel | Bloquea publicación | Efecto |
|---|---|---|---|
| `EV_CAJA_SIN_PERFIL` | DATOS | sí | Sin perfil vigente: **la presencia no se interpreta como caja** (tope 0). |
| `EV_CAJA_PERFIL_AMBIGUO` | DATOS | sí | Dos o más perfiles vigentes: tope 0. |
| `EV_CAJA_NO_ACREDITADA` | DATOS | sí | Tope 0. |
| `EV_CAJA_SIN_DETALLE` | DATOS | sí | Sin fuente, o «presencia menos reservas» sin reservas ni función mínima: tope 0. |
| `EV_CAJA_DECLARACION_CONTRADICTORIA` | DATOS | sí | «Toda la presencia» junto con reservas o función mínima: tope 0. |
| `EV_FUNCION_HABITUAL_EXCEDE_PRESENCIA` | DATOS | sí | Tope 0. |
| `EV_PRESENCIA_SUPERA_CONTRATO` | ADVERTENCIA | no | Solo informa. |
| `EV_RESERVA_FUERA_DE_PRESENCIA` | ADVERTENCIA | no | Esas horas no cuentan. |
| `EV_CAJA_PERFIL_DESCONOCIDO` | ADVERTENCIA | no | Se ignora. |

Un EVENTUAL acreditado **sin** tope (ni máximo ni función mínima) conserva el bloqueo existente `POLITICA_EV_COMPARACION_PENDIENTE`, porque AH2-040 sigue sin homologar.

Ningún valor se completa por defecto. No hay 12 h ni ningún otro número implícito.

**Verificadores independientes** (recalculan desde la entrada cruda y el plan). Detectan cuatro casos:
- caja asignada a un EVENTUAL no acreditado;
- caja dentro de una reserva;
- caja por encima del tope;
- caja fuera de la presencia.

En las pruebas se construye cada infracción y ambos verificadores la detectan.

### 1.3 Reporte por persona (idéntico en A y B)

| Rol | Campos |
|---|---|
| FULL / PART | horas contractuales y horas de caja |
| AUX | presencia, caja, supervisión o fuera de caja, y capacidad efectiva de caja K |
| EVENTUAL | ver la lista siguiente |

Campos del reporte para cada EVENTUAL:
- acreditación;
- horas contractuales;
- presencia;
- horas reservadas a la función habitual;
- función mínima;
- tope y su origen;
- disponibilidad efectiva de caja;
- oportunidades con demanda;
- horas de caja;
- disponibilidad restante;
- horas de función habitual realizadas.

### 1.4 Análisis EVENTUAL > AUX

Para cada par con `caja(e) > caja(a)`, el análisis clasifica el par así:
- `COMPARABLE`: O(e) ⊆ K(a);
- `PARCIALMENTE_COMPARABLE`;
- `NO_COMPARABLE`;
- `AUX_SOLO_SUPERVISION`: K(a) = ∅.

Explica la causa en horas, franja por franja:
- el AUX está ausente;
- el AUX está presente pero sin capacidad de caja (supervisando);
- dentro de la capacidad del AUX.

Muestra además la ventana determinada que usa P3. Para ver qué pasaría con un límite semanal estricto se corre el mismo caso en dos modos:
- **P2E**: contra todo AUX con solapamiento;
- **PT**: contra **todo** AUX con capacidad de caja, haya o no solapamiento. Es la lectura literal de «nunca más EVENTUAL que AUX» y excluye solo al AUX que únicamente supervisa.

## 2. Casos sintéticos

Base común: la de AH2-040. Un PART de 32 h; dos AUX supervisores en días alternos (`aux-sA`, `aux-sB`); demanda de 3 cajas de lunes a sábado de 09 a 22 h; corte 22:00; máximo 2 bloques.

| # | Caso | EVENTUALES (ninguno con sector o puesto declarado) |
|---|---|---|
| 1 | Funciones diversas | Cinco EVENTUALES de 30 a 48 h, con distintas jornadas: ver la lista siguiente. |
| 2 | Semana siguiente | Mismos perfiles. ev-1 pasa a reservas de 09 a 11 (nueva versión) y ev-2 tiene otra presencia. |
| 3 | Exceso no comparable | AUX de caja solo el lunes de 09 a 13; EVENTUAL de 09 a 21 de lunes a sábado con 4 h diarias de función habitual. |
| 4 | Roles intercambiables | Dos AUX sin supervisor fijo; EVENTUAL coincidente con «toda la presencia». |
| 5 | Datos inconsistentes | Perfil ambiguo, contradictorio, función mayor que presencia, presencia mayor que contrato, sin detalle, perfil vencido y perfil de una persona inexistente. |

Los cinco EVENTUALES del caso 1:
- **ev-1:** 48 h; reserva fija de 09 a 12, de lunes a sábado.
- **ev-2:** 30 h; «toda la presencia» declarada.
- **ev-3:** 40 h; 28 h mínimas de función habitual.
- **ev-4:** 36 h; **sin acreditar**.
- **ev-5:** 36 h; reserva el jueves y máximo semanal de 10 h.

Modos de corrida:
- `HEREDADO`: sin perfiles. Es el comportamiento previo: la presencia completa se trata como caja.
- `P0`: perfiles sin relación AUX/EVENTUAL.
- `P3`: la propuesta P3.
- `P2E`: límite contra todo AUX con solapamiento.
- `PT`: límite estricto contra todo AUX con capacidad de caja.

**Cómo reproducirlo:**
- B: `python -m optimizer.ev_caja_lab --out results/ev_caja --seconds 10` (semilla 20261119, un worker).
- A: `EV_CAJA_OUT=<archivo> npx vitest run src/algoritmo/__tests__/ev-caja-disponibilidad.test.ts`.

La tabla completa (50 filas, A y B) está en `docs/evidencia/ev-disponibilidad-caja.csv`. Las entradas y los planes están en aliada-optimizer, en `results/ev_caja/`.

## 3. Resultados

**Estado de las corridas:**
- B: las 25 corridas terminaron `OPTIMAL`, en 26 s en total.
- Ambos motores: 0 infracciones en los tres verificadores (disponibilidad, relación del modo y validador del motor).
- Validación cruzada: los 25 planes B se validaron con los verificadores A. El reporte por persona y el análisis de excesos coinciden exactamente.
- Diagnósticos idénticos en A y B.

**Faltantes en horas, B / A:**

| Caso | HEREDADO | P0 | P3 | P2E | PT |
|---|---|---|---|---|---|
| 1 Funciones diversas | 26 / 42,5 | 80 / 90 | 80 / 90 | 80 / 90 | 80 / 90 |
| 2 Semana siguiente | 32 / 50,5 | 86 / 96 | 86 / 96 | 86 / 96 | 86 / 96 |
| 3 Exceso no comparable | 126 / 128 | 150 / 150 | 150 / 150 | 150 / 150 | **194 / 194** |
| 4 Roles intercambiables | 106 / 106 | 106 / 106 | 106 / 106 | 138 / 140 | 138 / 140 |
| 5 Datos inconsistentes | 44 / 65 | 126 / 126 | 126 / 126 | 126 / 126 | 126 / 126 |

### Lectura

1. **La cobertura heredada era aparente.** Sin perfiles, el plan cubre más porque usa horas que la persona necesita para su función habitual.

   Medido con los verificadores sobre los planes `HEREDADO` (B / A):

   | Caso | Caja en reservas | Caja sin acreditar | Por encima del máximo o de la función mínima |
   |---|---|---|---|
   | 1 | 17 / 16,5 h | 23,5 / 24 h | 35 / 26,5 h |
   | 3 | 24 / 24 h | — | — |
   | 5 | 6,5 / 2 h | 94,5 / 80 h | — |

   La diferencia de faltantes P0 − HEREDADO (54 h en el caso 1, en B) **no es una pérdida causada por la protección**: es demanda que solo se cubría invadiendo la función habitual. Debe mostrarse como faltante real y no ocultarse.

2. **P3 no protege la carga semanal.** En los cinco casos P3 = P0. La protección la dan las reservas, la función mínima y el tope de cada EVENTUAL: por ejemplo, ev-3 queda en 12 h y ev-5 en 10 h, ambos con el 100 % de su función habitual preservada.

3. **Situaciones EVENTUAL > AUX:**

   | Caso | Par | Clase | Exceso | Causa |
   |---|---|---|---|---|
   | 3 | ev-1 vs aux-t | NO_COMPARABLE | 44 h | Las 48 h del EVENTUAL ocurren con el AUX ausente. |
   | 1, 2 y 5 | EVENTUALES vs aux-sA / aux-sB | AUX_SOLO_SUPERVISION | — | Excluidos por definición. |
   | 4 | ev-1 vs AUX rotativos | PARCIALMENTE_COMPARABLE | — | Roles AUX sin supervisor fijo. |

   - **Ningún par COMPARABLE presentó exceso en B.** La prioridad AUX por franja (AH2-036) lo impide.
   - En A aparece un par COMPARABLE con exceso **solo** en el caso 4: la heurística no elige la identidad AUX a favor del par (aux-t 14,5 h contra 48 h del EVENTUAL). Es el mismo efecto medido en AH2-040 y es un límite conocido de A.

4. **Límite semanal estricto** (sin relajar restricciones aprobadas):
   - Caso 3, `PT`: el EVENTUAL queda limitado a las 4 h del AUX y la cobertura cae en **44 h**. Ninguna de esas horas pasa a un AUX, porque no hay ninguno de caja.
   - Caso 4, `P2E` / `PT`: −32 h en B y −34 h en A. CP-SAT reparte 16 h a cada AUX y al EVENTUAL.
   - En los casos 1, 2 y 5 no cambia nada, porque ningún EVENTUAL supera a un AUX con capacidad de caja.

## 4. Límites y reglas de negocio pendientes

AH2-040 **no está completada.** Faltan estas decisiones del propietario:
1. Definición homologada de comparabilidad (P3 recomendada, no aprobada).
2. Si se quiere además un límite semanal por totales (PT/P2E), con el costo medido aquí.
3. Política de publicación cuando un EVENTUAL no tiene perfil acreditado. En el laboratorio queda en 0 h de caja y bloquea la publicación; falta confirmar si debe ser así o si alcanza con bloquear la publicación.
4. Quién acredita, con qué frecuencia de revisión y si una vigencia puede ser indefinida.
5. Valores reales por persona en la 091.
6. Persistencia y permisos, que requieren una migración autorizada.
7. Generalización a tres o más AUX.

Otros límites:
- A sigue siendo heurístico: en el caso 1, P0 le faltan 10 h más que a B.
- El análisis no reemplaza la decisión normativa.
- Todo es evidencia sintética.
