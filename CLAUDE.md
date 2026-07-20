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

CAPA 1 — ALGORITMO DETERMINÍSTICO (src/algoritmo/, orquestador P1→P2→P3)
Responsabilidad: generar el horario completo con precisión
matemática garantizada. No usa IA.

REGLAS LABORALES INVIOLABLES (por construcción del algoritmo, NUNCA
configurables — convenio de comercio argentino):
- FULL: 48h exactas, composición 3x9h + 2x8h + 1x5h con 2 cortados,
  descanso mínimo 12h entre jornadas.
- PART: máximo 31h, jornadas corridas de 4-6h, descanso mínimo 12h.

REGLAS OPERATIVAS CONFIGURABLES (pantalla Reglas; NADA hardcodeado):
cada sucursal ajusta su operatoria. Ver src/utils/preferencias.ts
(configOperativaDeReglas / DEFAULTS_OPERATIVOS) y src/algoritmo/types.ts
(InputAlgoritmo). Defaults del negocio:
- apertura_solo_aux (ON): 08:00-09:00 sólo con AUX, sin cajeros.
- sin_aux_cierre (ON): los AUX no se sientan en caja después de 22:00.
- supervisor_jornada_completa (OFF): con 2+ AUX presentes, el de mayor
  presencia queda parado toda la jornada.
- franco_medio_corridos (ON): el día de 5h de cada FULL pegado a su franco.
- min_cajeros_franja: mínimo N cajeros en una franja (sube la demanda).
- max_francos_dia (2): tope de francos FULL+PART por día, subible/bajable.
Jerarquía de cobertura (cascada): cajeros FULL/PART → AUX → eventuales.
El fallback del algoritmo (config ausente) reproduce el comportamiento
histórico, por eso los tests que llaman directo al motor no cambian.

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