---
# REGISTRO DE DECISIONES

## 2026-03-28
- Migración de Firebase a Supabase aprobada por Claude
- Se usa proyecto AL-iada con prefijo ep_ para separar datos
- SuperAdmin identificado por email en vez de UID hardcodeado
- MercadoPago y Netlify Functions sin cambios

## 2026-03-30
DECISIÓN: Arquitectura algoritmo + IA
PROBLEMA: Los LLMs no garantizan precisión matemática para
generar horarios (devuelven horas incorrectas, ignoran
distribuciones exactas, cobertura parcial).
SOLUCIÓN: Separar responsabilidades en dos capas. El algoritmo
determinístico garantiza corrección matemática. Claude API
actúa solo como revisor humano opcional post-generación.
RESULTADO: Cobertura >85%, 0 errores de reglas laborales,
sugerencias humanamente útiles sin riesgo de corromper el
horario base.
---