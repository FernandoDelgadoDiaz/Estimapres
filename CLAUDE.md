# CLAUDE / ASTRA — PUNTO DE ENTRADA A ALIADA HORARIOS 2.0

Este archivo aplica a **Claude**. Las mismas reglas están en **[AGENTS.md](AGENTS.md)** para Astra / OpenAI (ChatGPT) y otros desarrolladores: **no hay una jerarquía entre modelos**. La autoridad de producto y autorizaciones sensibles corresponde al propietario.

## Antes de tocar código o datos
1. Verificar rama actual, SHA de HEAD, cambios abiertos y la Issue/PR.
2. Leer **[docs/ALIADA_HORARIOS_MASTER.md](docs/ALIADA_HORARIOS_MASTER.md)** — única fuente de verdad normativa y decisiones aprobadas, tras su integración autorizada.
3. Leer **[docs/CURRENT_WORK.md](docs/CURRENT_WORK.md)** **de esa misma rama** — tarea exacta, bloqueos, pruebas, próximo paso.
4. Leer **[AGENTS.md](AGENTS.md)** — protocolo completo de ejecución y transferencia.

**Prohibido sin autorización expresa del propietario:** merge, deploy, migraciones, cambios de producción, datos operativos, gastos y decisiones nuevas de arquitectura o interpretación normativa.

**Transferencia obligatoria:** documentar resultados y SHA real en CURRENT_WORK, y registrar evidencia en la Issue/PR. Nunca depender de memoria del chat.

Los archivos `ai/architecture.md`, `ai/rules.md` y `ai/decisions.md` se conservan como **historia del proyecto**: describen arquitecturas y roles de 2026 que pueden estar desactualizados. No prevalecen sobre la nueva especificación aprobada.

> Protocolo vigente en `main` desde `9909e87` (PR #2). Jerarquía (AH2-018): MASTER es la única autoridad de producto; CURRENT_WORK solo estado operativo y relevo — empezar por su primera sección, «PUNTO ÚNICO DE RETOMA» — y luego el PR de la rama activa.
