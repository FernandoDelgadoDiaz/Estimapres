# SEC-02 — Auditoría de seguridad de la base compartida (solo lectura)

**Fecha:** 12/11/2026  
**Proyecto:** `apbmsjjetejacwzkrlva` (`al-iada horarios`)  
**Contexto:** autorización del propietario para **avanzar en la corrección previa revisión de dependencias y respaldo**. No autoriza publicar PR #30 ni operar otras aplicaciones a ciegas.

## 1. Estado verificado, sin modificar datos

Consulta `pg_class.relrowsecurity`, `has_table_privilege` y `get_advisors(type=security)`:

| Tabla | RLS | anon SELECT | anon INSERT | Registros, COUNT real |
| --- | --- | --- | --- | ---: |
| `al_appointments` | OFF | Sí | Sí | 5 |
| `al_calendar_change_logs` | OFF | Sí | Sí | 0 |
| `al_conversations` | OFF | Sí | Sí | 0 |
| `al_patients` | OFF | Sí | Sí | 1 |
| `al_tenants` | OFF | Sí | Sí | 3 |
| `ep_lenders` | OFF | Sí | Sí | 0 |
| `ep_settings` | OFF | Sí | Sí | 0 |

**9 filas existentes** en las siete tablas. No se leyó ninguna fila ni contenido identificable. Los contadores estimados `pg_stat_user_tables.n_live_tup` daban cero para todas las tablas y **no son fiables** aquí; se contrastaron con `COUNT(*)` real. Potencial contenido sensible según metadatos: `al_patients.phone_number/name`, `al_tenants.google_refresh_token/doctor_email`, `ep_lenders.dni/mp_token`, además de mensajes y payloads en tablas `al_*`.

El advisor reportó 7 errores `rls_disabled_in_public`, más advertencia `function_search_path_mutable` para `public.es_usuario_real`; las tablas señaladas por el advisor también son visibles para rol `anon` en GraphQL. [Guía oficial RLS](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

**Separación importante:** las cinco tablas de Aliada Horarios `colaboradores`, `reglas_configurables`, `semanas_historial`, `correcciones_manuales`, `aprendizajes_derivados` sí tienen RLS activado y políticas de SELECT/INSERT/UPDATE/DELETE; no se realizaron pruebas efectivas de autorización.

## 2. Dependencias auditadas / límites

- Búsqueda del código accesible en GitHub de `FernandoDelgadoDiaz`: sin referencias activas a `al_*`; `ep_lenders` y `ep_settings` aparecen en `Estimapres/ai/architecture.md` (documentación histórica). **No prueba que no existan apps privadas/externas.**
- Supabase Edge Functions del proyecto: ninguna.
- Logs `postgrest_logs` de las últimas 24 h: 84 eventos, ninguno con nombres de estas siete tablas en el campo `path`. **La ventana no demuestra falta de uso histórico o futuro.**
- Tabla `al_tenants` tiene registros; estos nombres y estructuras sugieren una aplicación de agenda/atención externa. Identificarla antes de modificar accesos.
- No se comprobó un respaldo externo, descarga, ni restauración de prueba. Los conectores disponibles permiten consultar el proyecto pero no acreditar una copia restaurable.

## 3. Puertas obligatorias ANTES de cualquier DDL

1. **Inventario completo de consumidores:** Netlify/Figma/otros frontends o funciones con claves de este proyecto; buscar el uso de tablas `al_*` y `ep_*`, endpoints y esquema de autenticación. Confirmar con el propietario los consumidores no visibles en GitHub. No copiar claves en Issues/PR.
2. **Backup verificable:** comprobar Backups/PITR en Supabase Dashboard; si no existe copia apropiada, generar un dump lógico cifrado y almacenado fuera del repo, con datos y esquema, mediante una sesión administrativa segura; verificar su integridad y procedimiento de restauración. El backup debe contener las nueve filas y todas las tablas requeridas por las apps consumidoras. [Guía oficial de backups](https://supabase.com/docs/guides/platform/backups).
3. **Diseño específico de permisos por consumidor:** autenticar/autorizar por tenant, definir RLS mínimo viable para las tablas con negocio activo; proteger tokens; no aplicar una política global `USING (true)`. Separar rutas server-side con service role protegido de acceso de cliente.
4. **Plan SQL + rollback y ensayo:** elaborar migration versionada propuesta en una rama aislada, con tests de rol `anon`, `authenticated` con y sin pertenencia a tenant, y consumidor legítimo. El rollback debe restaurar exactamente políticas/grants previos si se deshace la corrección; no basta con una captura del esquema.
5. **Ventana operativa:** aplicar con autorización ya sujeta a estas condiciones, verificar que `anon` no pueda leer ni escribir las tablas sensibles, y ejecutar smoke tests de todas las aplicaciones consumidoras. Detener y revertir de inmediato ante fallo.

## 4. Estado y siguiente acción

**AUDITADO / NO CORREGIDO.** No se ha ejecutado SQL DDL ni DML, ni creado backup, ni modificado Supabase, ni desplegado o fusionado nada a `main`.

El propietario quiere empezar cuanto antes un piloto real de Aliada Horarios 2.0. **PR #30 continúa en draft, sin autorización de merge ni deploy.** Esta auditoría es independiente del release; no bloquear la definición del piloto con tareas de simulación adicionales, pero no exponer más datos laborales hasta comprobar aislamiento y corregir los accesos compartidos.

Próximo responsable: identificar consumidores `al_*` y `ep_*`, respaldar y verificar restauración antes de redactar/aplicar la migración real de seguridad, usando la Issue #5 para evidencia agregada.
