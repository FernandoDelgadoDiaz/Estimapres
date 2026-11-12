# AUX-01 — AUX y eventuales sin planificación manual semanal

**Estado:** diseño PROPUESTO (Claude, 2026-11-12). Implementada solo la parte sin decisiones laborales ni migraciones (§3). Seguimiento: Issue AUX-01 (ver épica #3).
**Requisito:** AH2-008: el supervisor no arma ni transcribe horarios cada semana.

## 1. Situación actual (verificada en código)
- **AUX:** su presencia semanal es un dato de entrada (`Auxiliar.horarioSemanal`, cargado a mano en Colaboradores). El motor **no la planifica**: la pasada 2 solo decide, dentro de esa presencia, cuándo el AUX se sienta en caja (`CAJA`) y cuándo supervisa parado (`PARADO`), según R1 apertura con supervisor, R2 sin AUX en caja después de las 22:00 y R3 supervisor de jornada completa.
- **Precondiciones del motor:** H-A1 exige al menos un AUX presente de 08:00 a 09:00. H-A2 exige al menos un AUX presente cada media hora entre 09:00 y 22:00. Si no se cumplen, la pasada 2 **no asigna ningún AUX a caja en toda la semana**, y el problema solo aparece como alerta técnica después de generar.
- **Eventuales:** `Eventual.horarioSemanal` es una disponibilidad cargada a mano. La pasada 3 decide cuándo cubren caja dentro de esa disponibilidad.
- **Consecuencia:** si los horarios de AUX o la disponibilidad de eventuales cambian cada semana, hoy hay que editarlos a mano cada semana. Eso contradice AH2-008.

## 2. Arquitectura objetivo

```text
Patrón habitual (por persona) ──┐
Excepciones por fecha ──────────┼─> disponibilidad de la semana ──> (opcional) planificador AUX ──> presencia AUX
Reglas v2 (#22) por persona ────┘                                                          │
                                                                                            v
                           motor actual: pasada 1 (FULL/PART) → pasada 2 (AUX en caja) → pasada 3 (eventuales)
                                                                                            │
                                                         validador independiente (#19) ◄────┘
```

1. **Disponibilidad habitual + excepciones por fecha** (eventuales y AUX). El patrón habitual es el `horarioSemanal` actual. Las diferencias puntuales se cargan como excepciones por fecha, con motivo y autor. **Implementado (§3).**
2. **Diagnóstico de supervisión previo** (apertura, supervisión continua y, más adelante, cierre). **Implementado (§3).**
3. **Planificador de presencia de AUX** (futuro). Genera los turnos de AUX dentro de su disponibilidad, como hace la pasada 1 con FULL/PART. Prioridades, en orden:
   1. restricciones duras del perfil AUX (decisiones pendientes);
   2. supervisión mínima por franja: apertura, continuidad y cierre;
   3. cobertura de caja en las franjas permitidas por R1–R3;
   4. equidad y rotación.

   Implementación candidata: un DP por persona como el de la pasada 1, o el mismo modelo CP-SAT de #13 con variables de presencia AUX. **No se usa la página 1 del POM como solución obligatoria.** Esa programación puede servir como referencia comparativa o como semilla opcional, nunca como verdad.
4. **Participación en caja:** se mantienen R1–R3 como reglas operativas (configurables y vigentes por ámbito con #22). Los eventuales cubren caja solo dentro de su disponibilidad y en el orden de cascada actual (cajeros → AUX → eventuales).

## 3. Implementado sin decisiones ni migraciones (`src/utils/disponibilidadHabitual.ts`)
- `resolverDisponibilidadSemana(personas, excepciones, lunes)`: aplica las excepciones de esa semana sobre el patrón habitual.
  - Devuelve copias; no modifica la entrada.
  - Marca el origen de cada día (habitual o excepción).
  - Informa y **no aplica**: horarios inválidos, excepciones sin motivo o autor, personas inexistentes y excepciones contradictorias para la misma fecha.
- `diagnosticarSupervision(auxiliares)`: con la misma semántica que H-A1/H-A2 del motor, devuelve los huecos en lenguaje del supervisor («miércoles: ningún supervisor (AUX) presente de 09:00 a 14:00»).
- `prepararDisponibilidadSemana(...)`: combina las dos funciones para AUX y eventuales.
- **Compatibilidad:** sin excepciones, el resultado es idéntico al dato actual.
- **Pruebas:** 9 tests, incluido uno que confirma que, con huecos, el motor real no asigna AUX a caja y, sin huecos, sí.

**Pendiente de conectar** (UI, sin migración si se guarda localmente): pantalla para cargar excepciones por fecha en Colaboradores y aviso de huecos en «Revisar» antes de generar. La persistencia en Supabase requiere migración autorizada (tabla `excepciones_disponibilidad`).

## 4. Decisiones necesarias del propietario (bloquean el planificador de AUX)
| ID | Pregunta |
|---|---|
| AUX-D1 | Contrato AUX: horas semanales, francos (¿como FULL? ¿franco y medio?), jornadas cortadas permitidas y descanso. Depende de D1–D3 / #7. |
| AUX-D2 | Supervisión mínima: ¿cuántos AUX presentes por franja? ¿Apertura y cierre obligatorios con AUX? ¿Hasta qué hora (D4)? |
| AUX-D3 | ¿Los AUX tienen patrón fijo que cambia poco (alcanza con §3) o deben planificarse cada semana según la demanda (hace falta el planificador)? |
| AUX-D4 | ¿Los eventuales pueden extenderse fuera de su disponibilidad habitual si falta cobertura, o la disponibilidad es estricta? |

## 5. Criterios de aceptación
**Parte implementada:**
- [x] Sin excepciones, la disponibilidad resuelta es igual al dato actual.
- [x] Una excepción solo afecta su fecha y queda marcada. Las inválidas o contradictorias se informan y no se aplican.
- [x] El diagnóstico coincide con el motor (H-A1/H-A2) y expresa los huecos en rangos horarios legibles.

**Pendiente:**
- [ ] UI de excepciones por fecha y aviso de huecos antes de generar.
- [ ] Persistencia (migración autorizada).
- [ ] Planificador de presencia AUX, tras AUX-D1 a AUX-D3: tests de supervisión mínima, apertura y cierre, contrato AUX, comparación de cobertura frente a presencia manual sobre el fixture sintético, y validador independiente con perfil AUX sin violaciones.
- [ ] Prueba de punta a punta: con patrón habitual más excepciones, el supervisor sube el POM y genera **sin editar** AUX ni eventuales.
