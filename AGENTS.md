# AGENTES Y ASISTENTES — ALIADA HORARIOS 2.0

Este archivo rige por igual para **Astra (ChatGPT)**, **Claude** y cualquier implementador posterior. Ningún modelo tiene autoridad exclusiva sobre otro; el **propietario** decide.

## Orden obligatorio al retomar
1. Identificar repositorio, rama activa, SHA y cambios/PR abiertos.
2. Leer **[`docs/ALIADA_HORARIOS_MASTER.md`](docs/ALIADA_HORARIOS_MASTER.md)** (decisiones y límites aprobados).
3. Leer **[`docs/CURRENT_WORK.md`](docs/CURRENT_WORK.md)** de la **misma rama** (tarea exacta, bloqueos, siguiente paso).
4. Revisar Issue/PR enlazadas; verificar el estado real antes de confiar en un resumen.
5. Si las fuentes se contradicen, registrar la discrepancia; no ejecutar el cambio controvertido hasta decisión del propietario.

## Reglas para cada sesión
- Trabajar en rama de tarea; **no escribir en main ni hacer merge, deploy, migraciones, escrituras/borrados de BD, altas de gastos o cambios de cuentas sin autorización expresa**.
- Mantener una sola fuente normativa: MASTER. Registrar las decisiones nuevas **solo en MASTER §9**, con su estado (PROPUESTO / APROBADO / etc.); solo las APROBADAS por el propietario son normativas. No duplicarlas en documentos de autoridad paralela (los planes son propuestas y enlazan al registro).
- Actualizar CURRENT_WORK con SHA **verificado**, archivos tocados, pruebas ejecutadas y resultados, bloqueos, PR/Issue, estado de BD y la próxima acción exacta.
- «Ejecutado», «probado», «publicado» o «aprobado» requieren evidencia real; distinguir propuestas e hipótesis.
- No subir secretos, POM original, nombres de empleados, datos de usuarios ni identificadores personales al repositorio público o a PR.
- La normativa laboral y convencional **aún requiere validación**: no inferir ley de una preferencia de negocio.
- Mantener restricciones duras separadas de reglas operativas y preferencias. No delegar legalidad ni cálculos al LLM.
- Los archivos `ai/*` y textos históricos del README pueden estar desactualizados; se consultan como antecedentes, **no como autoridad**.

## Cierre de turno / transferencia
Dejar CURRENT_WORK actualizado y el estado en GitHub. El siguiente modelo debe poder continuar sin pedir contexto al usuario. Si no hubo cambios, explicar por qué en la Issue.

**Nota:** en esta rama el contrato es un **PR propuesto**; la versión en `main` solo cambiará si el propietario autoriza el merge.
