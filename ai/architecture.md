---
# ARCHITECTURE LOCK — ESTIMAPRES v2.0
# MIGRATION: Firebase → Supabase
# FECHA: 2026-03-28
# AUTORIDAD: Claude (Anthropic)

STACK:
- Frontend: HTML/CSS/JS vanilla
- Auth: Supabase Auth (email/password)
- DB: Supabase PostgreSQL (proyecto AL-iada, prefijo ep_)
- Pagos: MercadoPago (Netlify Functions, sin cambios)
- Deploy: Netlify

TABLAS:
- ep_lenders
- ep_settings

SUPER_ADMIN: identificado por email, NO por UID hardcodeado

MÓDULOS A MIGRAR (en orden):
1. Auth (signUp, signIn, signOut, onAuthStateChange)
2. Onboarding (guardar en ep_lenders + ep_settings)
3. SuperAdmin (listar, activar, suspender)
4. Status listener (tiempo real con sb.channel)
5. Panel prestamista

PROHIBIDO:
- Cambiar UI/CSS
- Cambiar lógica de MercadoPago
- Tomar decisiones fuera de este documento
---

## HORARIO OPERATIVO - ALIADA HORARIOS

Cajas abiertas: 08:00 a 22:00
Cierre del local: 22:00 a 23:00 (solo AUX, sin caja)
Primera franja con cajero: 08:00 (1 AUX solo)
Última franja con cajero: 22:00
La franja 22:30 NO existe operativamente

REGLAS DE CIERRE:
- Cajeros terminan a las 22:00
- Cierre 22:00-23:00
- Última franja 22:00
- Los 2 AUX reservados para cierre no cubren caja desde las 22:00

## ARQUITECTURA DE GENERACIÓN DE HORARIOS

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