# CLAUDE / ASTRA — PUNTO DE ENTRADA A ALIADA HORARIOS 2.0

Este archivo aplica a **Claude**. Las mismas reglas están en **[AGENTS.md](AGENTS.md)** para Astra (ChatGPT) y otros desarrolladores: **no hay una jerarquía entre modelos**. La autoridad de producto y autorizaciones sensibles corresponde al propietario.

## Antes de tocar código o datos
1. Verificar rama actual, SHA de HEAD, cambios abiertos y la Issue/PR.
2. Leer **[docs/ALIADA_HORARIOS_MASTER.md](docs/ALIADA_HORARIOS_MASTER.md)** — única fuente de verdad normativa y decisiones aprobadas, tras su integración autorizada.
3. Leer **[docs/CURRENT_WORK.md](docs/CURRENT_WORK.md)** **de esa misma rama** — tarea exacta, bloqueos, pruebas, próximo paso.
4. Leer **[AGENTS.md](AGENTS.md)** — protocolo completo de ejecución y transferencia.

**Prohibido sin autorización expresa del propietario:** merge, deploy, migraciones, cambios de producción, datos operativos, gastos y decisiones nuevas de arquitectura o interpretación normativa.

**Transferencia obligatoria:** documentar resultados y SHA real en CURRENT_WORK, y registrar evidencia en la Issue/PR. Nunca depender de memoria del chat.

Los archivos `ai/architecture.md`, `ai/rules.md` y `ai/decisions.md` se conservan como **historia del proyecto**: describen arquitecturas y roles de 2026 que pueden estar desactualizados. No prevalecen sobre la nueva especificación aprobada.

> Este cambio existe por ahora solo en un PR de **Fase 0**. Hasta que el propietario autorice su merge, no afirmar que `main` ya adoptó el nuevo protocolo.
