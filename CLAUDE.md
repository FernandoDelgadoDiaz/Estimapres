---
# REGLAS OBLIGATORIAS — LEER ANTES DE CUALQUIER ACCIÓN

Ver /ai/rules.md — OBLIGATORIO seguir estas reglas sin excepción.

ROLES:
- Claude (claude.ai) = Arquitecto y validador final
- DeepSeek (este modelo) = Implementador únicamente
- ChatGPT = Auditor externo

PROHIBIDO:
- Tomar decisiones de arquitectura
- Modificar estructura sin aprobación de Claude
- Generar código sin ARCHITECTURE LOCK definido

Etapa actual: ver /ai/architecture.md
---

## ARQUITECTURA DE GENERACIÓN DE HORARIOS - ALIADA HORARIOS

La app usa una arquitectura de dos capas para generar horarios:

CAPA 1 — ALGORITMO DETERMINÍSTICO (algoritmoAsignacion.ts)
Responsabilidad: generar el horario completo con precisión
matemática garantizada. No usa IA. Garantiza:
- Horas exactas por colaborador (48h FULL, 32h PART)
- Distribución correcta de jornadas (3x9h + 2x8h + 1x5h + franco)
- Francos respetando máximo 2 por día
- Turno tarde/mañana fijo por colaborador PART
- Descanso mínimo 12h entre jornadas
- Jerarquía de cobertura: cajeros → AUX baches → eventuales
- 1 AUX solo en franja 08:00-09:00
- 2 AUX reservados para cierre 22:00-23:00
- Cupo de cajeros a las 22:00 según necesidad real del PDF

CAPA 2 — CLAUDE API (iaAsignacion.ts) — OPCIONAL
Responsabilidad: revisar el horario ya generado y sugerir
hasta 3 mejoras humanamente razonables que el algoritmo
no puede detectar. Ejemplos:
- Jornadas consecutivas de alta carga para un colaborador
- Desbalance de turnos duros concentrados en los mismos días
- Oportunidades de rotar cargas entre colaboradores similares
- Patrones de descanso subóptimos aunque matemáticamente válidos
Claude NO genera horarios. Claude NO modifica la estructura.
Si Claude falla, el resultado del algoritmo se muestra igual.