# CURRENT WORK — ALIADA HORARIOS 2.0

**Última actualización:** 2026-11-12
**Tarea en curso:** Fase 0 — documentación y protocolo de relevo Astra/Claude.
**Issue:** https://github.com/FernandoDelgadoDiaz/Estimapres/issues/1
**Repositorio:** `FernandoDelgadoDiaz/Estimapres`
**Rama de trabajo:** `docs/aliada-horarios-2-fase0` (creada desde `main` en `02ad9d9d46c3477022dbf1c084b5642c1e996c0c`).
**PR:** pendiente de creación/verificación (completar enlace y SHA al finalizar).
**Autoridad de producto:** propietario. Ningún modelo tiene prioridad sobre otro.

## Estado confirmado previo a editar
- `main`: `02ad9d9d46c3477022dbf1c084b5642c1e996c0c` (última lectura 2026-11-12).
- `docs/` no existía en árbol de `main`; `CLAUDE.md` contenía instrucciones históricas de jerarquía Claude/DeepSeek/ChatGPT y enlaces a `ai/rules.md`.
- El motor actual, tests y base **no** forman parte de F0.
- Supabase restaurado, último estado comprobado `ACTIVE_HEALTHY` (2026-11-12), consultado solo lectura; tiene riesgos P0 de tablas ajenas sin RLS (detalle en MASTER).
- Los datos del POM laboral 16–22/11 se consultaron desde Gmail. **No** subir PDF ni empleados al repo público.

## Checklist de F0
- [x] Inspeccionar `main`, archivos históricos y ramas/PR/Issues.
- [x] Crear rama `docs/aliada-horarios-2-fase0`.
- [x] Crear Issue #1 de continuidad.
- [ ] Crear `docs/ALIADA_HORARIOS_MASTER.md` con decisiones y prioridades.
- [ ] Crear `docs/CURRENT_WORK.md` con estado verificable de transferencia.
- [ ] Crear `AGENTS.md` neutral para ambos modelos.
- [ ] Reemplazar `CLAUDE.md` antiguo por enlace al mismo protocolo.
- [ ] Abrir PR **draft**, revisar archivos y confirmar HEAD/SHAs.
- [ ] Dejar constancia en Issue #1; no fusionar.

## Alcance / no alcance
**Permitido:** solo documentación y metadatos de GitHub de esta fase, en rama no productiva.
**Prohibido en esta tarea:** tocar `src/`, `supabase/`, funciones Netlify, dependencias, datos operativos, RLS, secretos, facturación, despliegues, merges.

## Validación a efectuar
- Revisar en GitHub que los cuatro archivos existen en la rama.
- Confirmar PR draft a `main` y estado de rama.
- Comprobar que cambios se limitan a documentación.
- **No afirmar** npm test/build: esta fase no ejecuta código.

## Bloqueos / riesgos conocidos (no resolver en F0)
1. RLS deshabilitado en siete tablas públicas no específicas del motor, permisos anónimos expuestos; aislamiento pendiente de autorización.
2. Proxy de Claude sin auth/rate limit; riesgo de consumo no autorizado.
3. Motor FULL exactamente 48h vs máximo 48h requerido; PART 31h vs 32h; validación legal/convenio pendiente.
4. Desajuste de slot 22:30, fecha de semana POM, IDs derivados de nombres y publicación sin validador completo.
5. Hasta julio hay dos semanas reales en `semanas_historial`; roster de noviembre no verificado; no publicar datos personales.

## Siguiente acción inequívoca para cualquier modelo
**F0:** completar y verificar este PR en borrador; informar al propietario el enlace, SHA y validaciones. **Detenerse** a la espera de revisión/autorización de merge. No iniciar F1, migraciones ni despliegues.
**Tras merge autorizado:** abrir Issue F1 por separado, comenzando por seguridad y contrato POM. Releer MASTER y CURRENT_WORK en la rama que corresponda.

## Plantilla obligatoria al finalizar cada sesión
- Fecha:
- Responsable/modelo:
- Issue y PR:
- Rama / SHA base / HEAD confirmado:
- Cambios realizados (archivos y motivo):
- Pruebas (comando, resultado y evidencia), no ejecutadas:
- Supabase: inspeccionado / migrado / datos modificados (sí/no, detalle):
- Deploy / merge / gastos (sí/no y autorización):
- Bloqueos / decisiones pendientes:
- Próxima acción **exacta**:
