## PUNTO ÚNICO DE RETOMA — AH2-043 reparto con prioridad a picos + corrección del PDF; PR listo, sin publicar · 21/11/2026, Claude

**Estado:** AH2-042 **publicado completo** (Netlify `main@ff6fcd4`, deploy `6b0177b930ae92e7fd26bc4c`, publicado 21/11 10:53 UTC; Cloud Run `aliada-optimizer-00005-rsm`). El propietario generó la semana 23–29/11 en producción: 88,3 %, 47 h faltantes (límite de dotación), reglas cumplidas. A partir de ese análisis pidió (21/11): corregir el PDF y que el motor **balancee y priorice horas y días pico**. Implementado como AH2-043 en PR de Estimapres (rama `feat/ah2-043-reparto-picos`) y de aliada-optimizer (misma rama, SHA `b81462ffeacf456a6dc4ab07f302f1ebd8e5b16f`). **No publicado.**

### Cambios
1. **PDF «Cobertura al generar: 0.0 %»:** cuando gana CP-SAT su propuesta no trae `cobertura_total_pct`; ahora el resultado usa la cobertura medida por el orquestador (validadores de A) para A y B.
2. **Motor (equilibrio v2):** tras faltantes, faltantes ponderados y sobrantes, el faltante restante se reparte con coste convexo por franja (1 + 2 + … + k) × prioridad = peso × (100 + hora pico + día pico). Detalle en MASTER AH2-043. Igual en CP-SAT y en el selector de A (prueba de paridad). v1 intacta.

### Evidencia (semana 23–29/11 real, A + CP-SAT local, 120 s, parámetros de producción)
| | v1 (hoy) | v2 (AH2-043) |
|---|---|---|
| Cobertura / faltantes / sobrantes | 88,3 % / 47 h / 0 | 88,3 % / 47 h / 0 |
| Franjas con 2+ cajas faltantes | 26 | **0** |
| Faltantes en la franja máxima de cada día | 0 | 0 |
| Faltantes en franjas ≥ 80 % del máximo del día | 5,5 h | 4,5 h |
| Sábado (día pico) | 0 h | 0 h |
| Peores franjas | Vie 16:00 0/4, Mié/Lun/Dom 0/2 | 1/2 en aperturas 09:00 y cierres 22:00 |
| Domingo 21:30 / 22:00 | 3/5 / 0/2 | 5/5 / 1/2 |
Los faltantes caen en los días de menor demanda (miércoles 22 %, jueves 20 %), de a una caja.

### Pruebas
pytest **166 passed / 1 skipped**; Vitest **603 passed / 4 skipped**; Playwright **17 passed / 1 skipped**; build OK.

### Para publicar (requiere autorización del propietario)
1. Fusionar el PR de aliada-optimizer, reconstruir la imagen con `b81462f` y desplegar revisión nueva (mín. 0 / máx. 1). Rollback: `aliada-optimizer-00005-rsm`.
2. Fusionar el PR de Estimapres y Publish deploy en Netlify. Rollback: deploy `6b0177b930ae92e7fd26bc4c`.
3. Orden: primero Cloud Run (acepta v1 y v2), después Netlify.

### Decisiones abiertas
- Escala de prioridad (100–300). Si el propietario quiere que los días flojos absorban menos faltante, se reduce el peso de «día pico».
- Máximos 12/8 permanentes (de AH2-042); cadena aliada-optimizer #1–#5 hacia `main`.
---

## RELEVO ANTERIOR — AH2-042 publicado en backend; falta Publish deploy (luego publicado) · 21/11/2026, Claude

**Estado:** publicación autorizada por el propietario (20/11/2026). Backend completo; la interfaz nueva espera el **Publish deploy** de `main@e8032c1` en Netlify (al-iada, producción bloqueada). Deploy activo al 21/11: `6b00af11bb927938de720319` (anterior). Prestify sin cambios.

### Hecho
- **Cloud Run (CP-SAT):** revisión `aliada-optimizer-00005-rsm`, imagen `optimizer:ca87283`, 100 % del tráfico; mín. 0 / máx. 1 instancia; CPU solo por solicitud. Controles de seguridad (origen, JWT, rutas, CORS) idénticos a la revisión anterior.
- **PR fusionados:** Estimapres #62 → `main` (`e8032c1`); aliada-optimizer #6 → `feat/minimo-impacto-semanal` (`f255dfc`). La cadena aliada-optimizer #1–#5 (borradores) sigue abierta hacia `main`; no afecta producción porque Cloud Run ya corre `ca87283`.
- **Migración AH2-042 aplicada** en Supabase al-iada horarios (por el propietario desde el SQL Editor; el conector no mostró la confirmación). Verificado: tabla, restricciones (`cms_sin_superposicion`, `cms_topes_semana_completa`, etc.), RLS, funciones SECURITY DEFINER, sin INSERT directo para `authenticated`, sin ejecución para `anon`.
- **Configuración 091 importada** con `cms_importar` (identidad del usuario de la 091, todo o nada), desde la configuración del servicio:
  - Permanentes desde 23/11: perfiles de los 4 EVENTUAL (toda la presencia), máximos FULL 12 h / PART 8 h, AUX único 08:00–09:00 los 7 días.
  - Temporal: «gestionar manualmente» de un supervisor, 23/11–29/11 (vence sola).
  - Lectura con RLS como el usuario: correcta. Semana 23–29/11 resuelve igual que la del servicio.
- **Verificación semana 30/11–06/12 sin Secret Manager:** flujo real de configuración con el servicio devolviendo opciones vacías → fuente `persistida`; A + CP-SAT `ca87283` local con los parámetros de producción (120 s, global, semilla 20261119) sobre la entrada del ensayo 091 llevada a esa semana: **origen B (FEASIBLE) válido**, cobertura **99,6 %**, 1,5 h faltantes, 0 sobrantes, sin infracciones en el validador de A; EVENTUAL FULL 12 h y PART 8 h de caja; la excepción temporal ya no aplica.

### Pendiente
1. **Propietario:** Netlify → al-iada → Deploys → `main@e8032c1` → **Publish deploy**.
2. Generar la semana 30/11 en la app con el POM real y confirmar que Nueva semana indica «configuración guardada de la sucursal».
3. Registrar el resultado aquí.

### Decisiones abiertas
- Máximos 12/8 importados como **permanentes** (en Secret Manager vencían el 29/11; MASTER los registra como elección de la 091). Se cambian desde Reglas → Configuración del motor si se prefiere otra vigencia.
- Llevar la cadena aliada-optimizer #1–#5 a `main`.

### Rollback
Cloud Run: revisión `aliada-optimizer-00004-966`. Netlify: deploy `6b00af11bb927938de720319`. Configuración: cambiar o desactivar reglas desde el editor (no vuelve a Secret Manager). Base: bloque de rollback al final de la migración. Secret Manager intacto (ya no es la fuente de configuración de la 091).
---

## RELEVO ANTERIOR — AH2-042 segunda ronda de correcciones; PR #62 listo para publicación · 20/11/2026, Claude

**Estado:** las 4 correcciones de la segunda ronda del propietario están implementadas, con pruebas de regresión, en el PR #62 (Estimapres, rama `feat/ah2-config-persistente-sucursal`) y en el PR #6 de aliada-optimizer (rama `feat/integracion-aliada-work-claude`, SHA `ca872838c830cd4b9b8f0eeae3d185f969613a93`). **Migración NO aplicada.** Nada cambiado en Supabase, Netlify, Cloud Run ni Secret Manager. Prestify sin cambios. Las demás reglas aprobadas se conservan.

### Correcciones (segunda ronda)
1. **Sin prorrateo de máximos semanales.** Topes por contrato: solo por semanas completas (inicio lunes, fin domingo), exigido en el cliente y en la base (`cms_topes_semana_completa`); un cambio dentro de la semana → conflicto. Perfil EVENTUAL: máximo individual y mínimo de función habitual son semanales; si difieren entre días con caja de la misma semana → conflicto explícito (nunca un valor intermedio).
2. **Sin retorno automático a Secret Manager.** Cuando la sucursal guardó o importó configuración (cualquier fila, activa o no), la guardada es la única fuente para siempre; desactivar todo deja al motor solo con lo vigente. Solo una sucursal que nunca guardó usa el servicio. El editor ya no ofrece reimportar si hay filas.
3. **Condiciones del supervisor día por día.** Alcance = tipo de condición + persona (también en la columna generada `alcance`). La excepción temporal rige solo en sus días y la permanente en los demás; cada tramo continuo va al motor con sus fechas reales. Turno homónimo con otra definición → clave propia. «Gestionar manualmente» y «franco y medio corrido» parciales → conflicto (regla del motor).
4. **Excepción de AUX único sin franja fija.** El validador ya no limita a 08:00–09:00: rige en las franjas autorizadas por la sucursal (matriz 7×30), con un único AUX presente. H-A2, R3, H-A3 sin cambios fuera de eso. Cambiado en A (`politicaRecursos`, pasada 2, AH2-040, comparabilidad, validador independiente, orquestador) y en B (`support`, `domain`, máscaras, comparación). Con matrices que solo autorizan la apertura, resultados idénticos.

### Pruebas de regresión
- `configuracionPersistente.test.ts` (31): topes por semana completa, perfil con máximo distinto → conflicto / igual → conserva, importar y desactivar todo → fuente persistida, turno temporal miércoles–jueves sobre permanente (verificado con `compilarCondiciones`), franjas libres de AUX único.
- `excepcionApertura.test.ts` + `aliada-optimizer/tests/test_excepcion_apertura.py`: mismo fixture en A y CP-SAT; AUX único en franja autorizada fuera de la apertura atiende caja; sin autorización queda de pie; A valida el plan de CP-SAT y rechaza sentarlo fuera de la franja (H-A2).
- SQL (`scripts/db/probar-configuracion-motor.sh`, job `database` en CI): alcance de condiciones por tipo y persona, topes solo semanas completas, más integridad, RLS, atomicidad, historial y concurrencia real.

### Resultados
Vitest **601 passed / 4 skipped**; pytest **163 passed / 1 skipped**; Playwright **17 passed / 1 skipped**; build OK; SQL OK. Configuración real 091 (local, sin versionar): resuelve idéntica y sin conflictos.

### Para publicar (requiere autorización del propietario)
0. **CP-SAT:** reconstruir la imagen con aliada-optimizer `ca87283` (Cloud Build) y desplegar una revisión nueva de `aliada-optimizer` (min 0 / max 1). Rollback: revisión `aliada-optimizer-00004-966`. Sin esto, CP-SAT rechaza franjas fuera de 08:00–09:00 y Horarios usa el motor A.
1. Aprobar y fusionar el PR #6 (aliada-optimizer) y el PR #62.
2. Autorizar la migración en Supabase al-iada horarios.
3. Publish deploy en al-iada.
4. Reglas → Configuración del motor → Importar → revisar → Confirmar.
5. «Ver semana» y generar. Rollback: cambiar/desactivar reglas en el editor (no vuelve a Secret Manager), republicar deploy anterior o rollback SQL documentado.
---

## RELEVO ANTERIOR — primera ronda de correcciones AH2-042 · 20/11/2026, Claude


**Estado:** concepto AH2-042 **aprobado**; las 6 correcciones pedidas están implementadas y validadas en el PR #62 (borrador). **Migración NO aplicada.** Nada cambiado en Supabase, Netlify, Cloud Run ni Secret Manager. Motor matemático y Prestify sin cambios.

### Correcciones implementadas
1. **Apertura configurable** por sucursal, día y franja (día, desde, hasta) sobre la grilla del motor; sin horarios fijos en esta capa: la franja admitida la decide el validador del motor (`erroresDatosRecursos`).
2. **Vigencia por fecha:** resolución día a día; excepciones que empiezan o terminan a mitad de semana. Perfiles: días sin acreditación → reserva de franja completa; reservas por día; cantidades semanales prorrateadas. Topes: prorrateo por días. Condiciones: fechas reales (el motor ya las evalúa por día); «gestionar manualmente» y «franco y medio corrido» exigen semana completa (regla del motor) → conflicto explicado.
3. **Integridad:** conflictos y reglas inválidas aislados por alcance; el resto se resuelve. Una semana con conflictos bloquea solo la generación híbrida, con detalle (motor anterior disponible). Simulación previa de cada cambio sobre las semanas afectadas: no se guarda si crearía un conflicto.
4. **Atomicidad y concurrencia:** escrituras solo por `cms_crear`/`cms_reemplazar`/`cms_desactivar`/`cms_importar`; versión + `FOR UPDATE`; exclusión de superposiciones en la base; reemplazo fallido sin cambios; importación todo o nada.
5. **Editor completo:** reservas horarias + mínimo de función habitual; todas las condiciones (franco, turno con definición, gestionar manualmente, máximo de francos, franco y medio corrido) con DEBE/PREFERIRÍA; Cambiar/Desactivar con versión; «Ver semana» con conflictos.
6. **Escala e historial:** esquema único, RLS por usuario, índices por usuario/sucursal, `reemplaza_a`, sin borrados.

### Validación
- Vitest **596 passed / 4 skipped** (28 de AH2-042); Playwright **17 passed / 1 skipped**; tsc y build OK.
- **Migración probada en Postgres 16 real** (`scripts/db/probar-configuracion-motor.sh`, nuevo job `database` en CI): integridad, RLS, atomicidad, historial y concurrencia real con dos sesiones. La prueba encontró y corrigió un `CHECK` que aceptaba una apertura mal formada (NULL en SQL).
- Configuración real 091 (local, sin versionar): semana 23–29/11 idéntica a la actual; semana siguiente sin conflictos.

### Para aprobar y publicar (propietario)
1. Aprobar el PR #62.
2. Autorizar la migración en Supabase al-iada horarios (Claude puede aplicarla con el conector si se autoriza explícitamente).
3. Fusionar y Publish deploy en al-iada.
4. Reglas → Configuración del motor → Importar → revisar → Confirmar (decidir si los perfiles EVENTUAL quedan permanentes).
5. «Ver semana» y generar. Rollback: desactivar reglas (vuelve el servicio), republicar deploy anterior o rollback SQL documentado.
---

## RELEVO ANTERIOR — motor híbrido 091 PUBLICADO en Horarios · 20/11/2026, Claude

**Estado: PUBLICADO.** #61 fusionado a `main` (merge `e91dd19f0e9499a261a527184bac41c6337313aa`, CI verde en `c5bcc0f`/`cd250de`). El propietario publicó en al-iada el deploy **`6b00af11bb927938de720319`** (commit `e91dd19`, producción, **bloqueado** contra auto publicación); `horarios.aliadaapps.com` sirve el bundle con `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL` del servicio. Otras sucursales mantienen el generador anterior; en la 091 el selector conserva el respaldo por generación.

**Servicio CP-SAT:** Cloud Run `aliada-optimizer` (proyecto `aliada-horarios`, `southamerica-east1`), imagen `optimizer:5b98417` (`sha256:c855db31…`), revisión **`aliada-optimizer-00004-966`**, min 0 / máx 1, concurrencia 1, facturación por solicitud, origen permitido solo `https://horarios.aliadaapps.com`, usuario y configuración 091 en Secret Manager (v2). Presupuesto de guardia USD 1. Prueba real: `POST /v1/optimizar` 200 en 125,6 s; conteos Supabase idénticos antes/después.

**Rollback (en orden de alcance):**
1. Por generación: selector «Usar motor anterior» en Nueva semana.
2. Solo el híbrido: `VITE_AH2_HIBRIDO_091=false` en al-iada + rebuild de `main` + Publish deploy.
3. Frontend completo: Netlify al-iada → Deploys → `6afba0e1c0b8e64caa476f2c` (commit `a7006e4`) → Publish deploy; mantener bloqueo.
4. Servicio: `gcloud run services update-traffic aliada-optimizer --region southamerica-east1 --to-revisions <revisión>=100` o `gcloud run services delete aliada-optimizer --region southamerica-east1` (la app cae al respaldo A).
Sin migraciones: ningún rollback requiere revertir datos. Prestify sin cambios.

**Pendientes no bloqueantes:** antecedente del domingo previo sigue SIN VERIFICAR si no se confirma en la app; Safari de escritorio no probado (iPhone visto por el propietario); vigencias de la configuración privada son 23–29/11: para semanas siguientes hay que cargar una versión nueva de `ah2-pilot-options` (no se renuevan solas). Notas del entorno Claude: `unset CLOUDSDK_AUTH_ACCESS_TOKEN` antes de gcloud; `*.run.app` solo alcanzable vía Cloud Build.

---

## RELEVO ANTERIOR — prueba real 091 aprobada en preview; fusión de #61 y publicación de al-iada · 20/11/2026, Claude

**Prueba real autenticada (preview `deploy-preview-61--al-iada.netlify.app`, build de `cd250de`, código = `c5bcc0f`):** el propietario inició sesión y generó la semana 23–29/11 de la 091 con el híbrido; no guardó. Cloud Run (revisión `00003-mtl`, origen temporal de la preview): `GET /v1/sesion` 200 (0,7–0,9 s), `POST /v1/optimizar` **200 en 125,6 s**, sin advertencias ni errores. Supabase al-iada horarios (solo lectura, usuario/091) **idéntico antes y después**: colaboradores 17 (15 activos), reglas 5 (4 activas), semanas_historial 18 (1 de la semana 23/11, previa del 19/11), correcciones 38, aprendizajes 0. Los 5 IDs de la configuración privada existen, activos, 091 y del mismo usuario. Visualización en iPhone aceptada por el propietario (uso principal en computadora).

**Cierre de la prueba:** origen de Cloud Run devuelto a `https://horarios.aliadaapps.com` (revisión **`aliada-optimizer-00004-966`**); controles negativos repetidos: 401 sin sesión/JWT inválido, 403 origen ajeno, preflight solo del dominio productivo.

**Publicación:** fusionar #61 a `main` (base `a7006e4` sin cambios). Producción de al-iada sigue con auto publicación bloqueada: el build de `main` queda listo sin publicarse; el propietario pulsa **Publish deploy** en ese build. Rollback: republicar `6afba0e1c0b8e64caa476f2c` (commit `a7006e4`) y bloquear; desactivar el híbrido con `VITE_AH2_HIBRIDO_091=false` + rebuild; servicio: `update-traffic` a una revisión anterior o borrarlo. Prestify no se toca (si el repositorio dispara un build suyo, queda sin publicar por su bloqueo).

---

## RELEVO ANTERIOR — CP-SAT operativo para 091 en Cloud Run; falta solo la parte Netlify · 20/11/2026, Claude

**Hecho:** el propietario entregó el UID Supabase verificado y la configuración privada original de la 091 (perfiles EVENTUAL, topes 12/8, exclusión manual, excepción de apertura). Validada contra `Config` y `ev_caja` del backend `5b98417` antes de cargarla. Secret Manager: `ah2-allowed-user-id` v2 y `ah2-pilot-options` v2 (v1 provisorias **deshabilitadas**). Revisión **`aliada-optimizer-00002-b77`** sirve 100 % con esos secretos; arranque sin errores; controles negativos repetidos desde Cloud Build: 401 sin sesión/JWT inválido, 403 origen ajeno, preflight solo `https://horarios.aliadaapps.com`. Rollback del servicio: `gcloud run services update-traffic aliada-optimizer --region southamerica-east1 --to-revisions aliada-optimizer-00001-wvt=100` (revisión que rechaza todo) o borrar el servicio. Ningún dato personal en repositorios.

**Actualización:** el propietario cargó en al-iada `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL` (URL del servicio, con barra final; el transporte la normaliza). Verificado por lectura de Netlify. Siguiente: preview de #61 con ese build, origen temporal en Cloud Run, recorrido autenticado del propietario y promoción.

**Bloqueo actual (Netlify, no Google):** el conector Netlify de Claude lee pero devuelve **403 al escribir variables de entorno**, y el despliegue por CLI quedó bloqueado por los permisos de la sesión Claude. Falta, con la sesión Netlify del propietario o un conector con permiso de escritura:
1. En al-iada → Environment variables (scope builds, contexto all): `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL=https://aliada-optimizer-925852091572.southamerica-east1.run.app`.
2. Rebuild del deploy preview de #61 (o un push documental a la rama) → Claude habilita temporalmente el origen exacto de esa preview en Cloud Run (`AH2_ALLOWED_ORIGIN`), el propietario inicia sesión y genera la semana 23–29/11 de la 091, Claude verifica logs/latencia/conteos y vuelve el origen al canónico.
3. Merge de #61 a `main` (producción sigue bloqueada: el build no se publica solo) y **Publish deploy** de ese build en al-iada por el propietario. Rollback: republicar `6afba0e1c0b8e64caa476f2c`. Prestify no se toca.

---

## RELEVO ANTERIOR — CP-SAT desplegado en Cloud Run (bloqueado por diseño hasta cargar usuario y configuración privada) · 20/11/2026, Claude

**Acceso resuelto:** gcloud autenticado con la cuenta del propietario (rol `owner` en `aliada-horarios`, facturación `017DA5-3AEF78-DC684E` vinculada). Nota del entorno Claude: la variable preconfigurada `CLOUDSDK_AUTH_ACCESS_TOKEN` debe quitarse (`unset`) para usar la sesión gcloud; `*.run.app` no es alcanzable desde el proxy del entorno, por eso los controles HTTP se ejecutan desde Cloud Build.

### Recursos creados (proyecto `aliada-horarios`, región `southamerica-east1`)
- APIs habilitadas: Cloud Build, Secret Manager, Billing Budgets (Cloud Run y Artifact Registry ya estaban).
- Artifact Registry `aliada` · imagen `optimizer:5b98417` (backend #6 `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`, sin cambios), digest `sha256:c855db31cb07c1e4503bfb1ef500232f4d299c767ea58b71f7d471cff1e24147`, 123 MB. Construida con Cloud Build (1 min 3 s).
- Cloud Run `aliada-optimizer`, revisión `aliada-optimizer-00001-wvt`, URL `https://aliada-optimizer-925852091572.southamerica-east1.run.app`. **min 0 / máx 1 instancia, concurrencia 1, CPU solo durante solicitudes (facturación por solicitud), sin CPU boost**, 1 vCPU / 2 GiB, timeout 300 s, ingreso público (la autenticación la hace el servicio contra Supabase Auth en cada solicitud).
- Variables: `SUPABASE_URL` y `SUPABASE_PUBLIC_KEY` (rol anon, tomadas del bundle público de Horarios), `AH2_ALLOWED_BRANCH=091`, `AH2_ALLOWED_ORIGIN=https://horarios.aliadaapps.com`.
- Secret Manager (réplica São Paulo): `ah2-allowed-user-id` y `ah2-pilot-options`, hoy con valores **provisorios que bloquean todo acceso** (`PENDIENTE-PROPIETARIO` y `{}`); accesibles solo por la cuenta de servicio de ejecución.
- Presupuesto de guardia **USD 1** en la cuenta de facturación, filtrado al proyecto, con alertas al 1 %, 50 % y 100 %.

### Controles verificados (desde Cloud Build, datos sintéticos)
Sin JWT → 401 `SESSION_REQUIRED` (estado, optimizar); JWT inválido → 401; origen ajeno → 403 `ORIGIN_DENIED` (incluido preflight); preflight del origen productivo → 204 con `Access-Control-Allow-Origin: https://horarios.aliadaapps.com` exacto; ruta inexistente → 404. `/healthz` no llega al contenedor (ruta reservada de Cloud Run); el frontend no la usa (`/v1/sesion`, `/v1/estado`, `/v1/optimizar`).

### Costo
Todo dentro de los tramos gratuitos: Cloud Build ~2 min de 2.500/mes; Artifact Registry 123 MB de 0,5 GB; Secret Manager 2 versiones activas de 6; Cloud Run en reposo = 0 instancias (free tier mensual: 180.000 vCPU-s, 360.000 GiB-s, 2 M solicitudes; una generación de 120 s ≈ 120 vCPU-s y 240 GiB-s). Bucket de fuentes de Cloud Build ~0,7 MB. No es promesa de factura cero; el presupuesto de USD 1 alerta ante cualquier consumo.

### Rollback
- Servicio: `gcloud run services delete aliada-optimizer --region southamerica-east1` (el frontend productivo no lo usa todavía) o volver a una revisión anterior con `gcloud run services update-traffic`.
- Frontend: producción sigue en el deploy bloqueado `6afba0e1c0b8e64caa476f2c` (commit `a7006e4`), verificado en lectura; sin cambios en Netlify. Prestify sin cambios.

### Falta para publicar (datos del propietario, no autenticación)
1. **ID de usuario Supabase (Auth) del supervisor autorizado de la 091** → versión nueva de `ah2-allowed-user-id`.
2. **Configuración privada vigente** (`Aliada_091_S48_config_piloto_privada.json`: perfiles EVENTUAL, topes 12/8, condiciones, excepción de apertura con los IDs reales de producción) → versión nueva de `ah2-pilot-options`. Revisar vigencias para la semana a generar.
3. Con ambos: nueva revisión de Cloud Run, preview Netlify del SHA de #61 con `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL` = URL del servicio, recorrido autenticado real, conteos antes/después y promoción solo de al-iada según `docs/PUBLICACION_HIBRIDO_091.md`. Una preview usa otro origen: habilitarlo temporalmente y volver al canónico.

---

## RELEVO ANTERIOR — facturación/API informadas; sesión Google presente, consola y Shell inaccesibles · 20/11/2026

**Nueva información del propietario:** proyecto `aliada-horarios` creado, facturación vinculada y API Cloud Run habilitada. Autoriza completar despliegue CP-SAT, conexión y publicación controlada 091, con consumo mínimo y **cero instancias mínimas/en reposo**; sin Prestify ni gastos no autorizados. No pedir nuevamente crear proyecto, vincular facturación, habilitar esa API ni aprobar el alcance funcional.

### Evidencia de esta retoma

- Se leyó de nuevo CURRENT_WORK y PR #61: HEAD documental `14f104d6021154076c56a57a9fc31db81c845bab`, sin merge. Código congelado frontend `c5bcc0f604234850d8348f904347e84006a780c2`, backend `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`; conservar CI aprobada y ensayos, sin repetirlos.
- Cloud Run sobre la URL exacta del proyecto sigue mostrando **Site Unavailable / Unable to access this site**, incluso tras la recarga de esta retoma.
- **La sesión Google del propietario sí está presente:** abrir el acceso oficial de Google redirigió a su Cuenta de Google autenticada. No se pidieron ni leyeron contraseñas, tokens o cookies. Una pestaña nueva de verificación de Cloud Run con esa sesión siguió mostrando el mismo error. No confundir este bloqueo con falta de login Google.
- Cloud Shell del mismo proyecto (`https://shell.cloud.google.com/?project=aliada-horarios`) también devolvió Site Unavailable. Se registró el obstáculo, sin intentos de eludir controles ni otros proveedores. No hay conector suficiente Cloud Run ni gcloud/configuración/ADC/credencial Google en el entorno local.
- No se pudo inspeccionar IAM, facturación/cuotas o configuración efectiva de Cloud Run; las acciones del propietario son información recibida, no verificadas desde consola. **No se desplegó, conectó ni publicó. Cero instancias no fue aplicado todavía.** No recursos remotos creados, permisos cambiados, datos operativos transferidos/escritos, merges, cambios Netlify/Prestify ni gastos por esta retoma.

### Continuación exacta

La ejecución requiere un entorno con acceso operativo a la consola o Cloud Shell de Google Cloud, o un cliente autorizado ya autenticado. La cuenta Google del navegador ya está autenticada; no volver a solicitar credenciales solo por este error. No insistir en cambiar proyecto/facturación/API para resolver el acceso del entorno.

Con acceso efectivo, verificar proyecto/cuenta/costos reales y desplegar el contenedor aprobado con `min-instances=0`, facturación por solicitudes y límite inicial de una instancia/concurrencia uno; seleccionar CPU/memoria mínimas compatibles con la ejecución validada y sin CPU permanente. Esta es la configuración deseada, no una configuración aplicada ni una promesa de factura cero. Si la operación implica gastos no cubiertos/autorizados, presentar costo concreto antes de ejecutar. Después controles del servicio, sesión real, conteos, rollback y publicación únicamente 091/al-iada según `docs/PUBLICACION_HIBRIDO_091.md`.

Este relevo es solo documental. El código con CI aprobada permanece en los SHAs anteriores; no repetir instalación/build/tests por este documento.

---

## RELEVO ANTERIOR — proyecto Google Cloud informado; acceso a consola bloqueado · 20/11/2026

**Orden actual del propietario:** informa que creó el proyecto Google Cloud `aliada-horarios` y autoriza desplegar CP-SAT, conectarlo a Horarios y completar la publicación controlada exclusivamente para 091. Sin instalar otros servicios, generar gastos sin autorización ni afectar Prestify. No volver a pedir autorización funcional; interrumpir solo por autenticación/costos, salvo un bloqueo técnico de acceso que impida materialmente continuar.

### Comprobado en esta retoma

- Leídos CURRENT_WORK de #61, MASTER AH2-041 y guía de publicación. #61 sigue abierto/borrador y sin merge; código frontend **`c5bcc0f604234850d8348f904347e84006a780c2`**, CI **44782995884 SUCCESS**, verificada de nuevo sin ejecutar tests. Backend #6 **`5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`**, CI **44782328398 SUCCESS**. No rehacer ensayos.
- Intento sobre la URL exacta del propietario: `https://console.cloud.google.com/run?project=aliada-horarios`. El navegador de esta sesión muestra **Site Unavailable / Unable to access this site**, antes de una pantalla de autenticación. Se registró el obstáculo y se hizo una única recarga, con igual resultado. No se infiere que el proyecto no exista ni que Google esté caído; no fue posible verificar cuenta, proyecto, facturación, cuotas o permisos.
- Sin alternativa autenticada por comandos: no hay gcloud disponible, configuración gcloud, credenciales ADC ni variables de acceso Google/Cloud SDK en el entorno. No se instaló SDK, servicio ni proveedor alternativo, ni se solicitaron/extrajeron claves del navegador.
- **No desplegado ni conectado.** No se creó recurso Cloud Run, imagen remota, cuenta, permiso o facturación; no se fusionó/publicó #61, no se modificó Netlify/Prestify ni la BD. Sin transferencia de dotación y sin gastos realizados por esta retoma. Los conteos anteriores son antecedentes, no un control nuevo de despliegue.

### Próximo paso exacto

Continuar con acceso operativo autenticado al proyecto `aliada-horarios`, desde una sesión/entorno donde la consola o herramientas Google Cloud estén disponibles. Primero verificar proyecto/cuenta y facturación/costo real antes de crear recursos; si habilitar facturación o gastar es necesario, presentar la aprobación concreta. Reutilizar el contenedor y SHAs anteriores y la configuración privada ya conservada; después controles negativos del servicio, recorrido autenticado, conteos y rollback, promoción solo de al-iada y 091. No abrir otros proveedores ni repetir las etapas aprobadas. **El bloqueo actual es de acceso de esta sesión, no falta de código ni de autorización funcional.**

Este commit es **solo documental**; el código congelado con CI aprobada es `c5bcc0f604234850d8348f904347e84006a780c2`. No confundir su SHA con un HEAD documental posterior. No se volvió a ejecutar CI/build para este relevo.

---

## RELEVO ANTERIOR — motor híbrido dentro de Aliada Horarios existente · 20/11/2026

**Orden vigente del propietario:** cancelar el piloto independiente, reutilizar lo validado e integrar en Horarios; primera activación 091, generador anterior como respaldo, publicación controlada con rollback. Sin otra app, cambios Prestify ni gastos. MASTER AH2-041. No retomar instalaciones de Render ni otro sitio piloto.

### Candidato de publicación

- Rama activa: `feat/ah2-hibrido-integrado-091`, creada desde `main` **`a7006e48476226976d8b698881ac5274eb568a7d`**, coincidente con producción de Horarios. No fusionar #60 completo: sigue como evidencia de laboratorio.
- Fuente validada reutilizada: #60 HEAD documental `1adaecbb170e9614e597fd098a483f20ab300f71`, código `aa410f74717e5c02bc7041204354a99cce8dedeb`; #6 HEAD documental `2550fb91422355a5e8268df01e2c27154bb7164d`, código/contenedor `361d7271b417d55a8a80fa10b104697d19de2d61`.
- Cambios nuevos: selector 091 en Nueva semana, Auth y configuración privada, relectura de dotación/reglas reales antes de enviar, Worker híbrido y progreso/cancelación, adaptación al ResultadoAsignacion habitual, revalidación de ediciones desde snapshot y snapshot en el jsonb existente del historial/PDF. Contrato/objetivos/solver reutilizados, sin repetir el ensayo real.
- Activación requiere `VITE_AH2_HIBRIDO_091=true` y URL HTTPS CP-SAT; por defecto desactivada. Otras sucursales conservan la ruta previa. `src/utils/generacionMultiArranque.ts`, `netlify.toml` y funciones de pago permanecen idénticos a main base. Se excluyeron sitio piloto, páginas de laboratorio, contingencias/ciclos y el refinamiento experimental del multi-arranque.
- Domingo confirmado/modo prueba se incluyen solo en la activación 091; sin antecedente no se certifica descanso ni se guarda operativamente. No se alteran automáticamente condiciones/vigencias ni se transforma un sello de laboratorio en aprobación; la revalidación vuelve a comprobar plan, perfiles, condiciones y DIAS.

### SHAs y CI verificados durante preparación

- Primer candidato integrado `e9f24d18c7e8883fac01895f80c950d672fb20df`: CI `44782412210`, **test-build y browser SUCCESS**. Incluye Worker HTTPS/PDF/cancelación, selector 091 y regresiones de la ruta anterior. No equivale a servicio real desplegado ni Safari físico.
- Backend emparejado `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`: CI `44782328398` **SUCCESS**, 161 pytest / 1 omisión histórica, smoke, build Docker y ejecución HTTP del contenedor.
- Revisión final de esta entrega conserva también los mínimos de caja en el snapshot de generación, para no releer reglas posteriores al reexportar. TypeScript y las 9 pruebas de integración aprobados. Confirmar el SHA/CI de este ajuste en **PR #61**, que es el candidato vigente, no publicar el primer SHA por memoria. El commit que contiene este relevo tiene SHA posterior a los anteriores.

### Evidencia nueva y conservada

- TypeScript y build de la integración aprobados localmente; Worker híbrido emitido en dist. Pruebas nuevas de integración: 9 aprobadas; frontera Auth/HTTP reutilizada: 9; antecedente: 4. Backend: 7 pruebas HTTP aprobadas para `/v1/sesion` protegido/configuración privada; no se repitió el benchmark CP-SAT.
- Se releyó el checkpoint privado existente a través de la nueva adaptación/revalidación: **cero infracciones, 47 h faltantes y 0 sobrantes**; SIN VERIFICAR por ausencia del domingo real. Sin ejecutar nuevamente el solver ni extraer POM.
- La regresión local inicial dio 567 aprobadas/4 omitidas y una prueba de **multi-arranque experimental con condiciones** fuera del alcance de este candidato. Ese generador nuevo se excluyó para mantener el productivo exacto; su prueba permanece en #60, junto a cierre/ciclos. Verificar CI del SHA nuevo para el conjunto final.
- Playwright local no pudo arrancar Chromium (`socket() failed: Operation not permitted`); no equivale a prueba funcional aprobada. Los nuevos e2e de Worker HTTPS/adaptación/PDF/cancelación y selector 091/otras sucursales sí pasaron en la CI remota del primer candidato. Exigir la CI del ajuste final. No declarar ensayo real autenticado ni Safari físico.
- Evidencia matemática anterior se conserva: 355/402 h cubiertas, 47 faltantes, cero sobrantes; déficit diario 8 / 8 / 7,5 / 7,5 / 8 / 0 / 8. Primeros cinco objetivos OPTIMAL, resto FEASIBLE a 120 s; no óptimo total. No rehacer AH2-036–040.

### Estado real, límites y siguiente paso

**No publicado. No hay servicio CP-SAT operativo.** Netlify autenticado sí está disponible: se vio producción de Horarios bloqueada en deploy `6afba0e1c0b8e64caa476f2c`, SHA `a7006e4`; botón de republicación observado en deploy anterior. Prestify sigue bloqueado y publicado en `905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. No se pulsó publicación/desbloqueo/rollback ni se modificaron esos proyectos.

Cloud Run y Cloud Shell no abrieron en esta sesión. El bloqueo restante de infraestructura es **alojar el contenedor CP-SAT en infraestructura disponible del propietario**, con acceso operativo y sin activar facturación ni gastos. No pedir otra app/proveedor. Código del servicio ya preparado; configurar origen exacto de Horarios, Auth, usuario y sucursal solo en servidor. No afirmar A+B efectivo cuando solo corre A.

RLS real revisada en lectura en esta sesión amplia: 15 activos (8 cajeros/3 AUX/4 EVENTUAL), 5 reglas; otro usuario/anon/sesión anónima ven 0 mediante transacciones READ ONLY con roles/claims y ROLLBACK. Esto no sustituye login real. Configuración privada conservada como `Aliada_091_S48_config_piloto_privada.json`; reutilizarla solo en servidor, revisar vigencia/semana. No incluir IDs personales ni nombres en código/bundle/PR.

Conteos de preparación (solo lectura, misma cuenta/091): colaboradores **17** (15 activos), reglas **5**, semanas **18**, correcciones **38**, aprendizajes **0**. Refrescar antes/después del despliegue; no confundir este registro con un control posterior a publicación.

**Próxima acción exacta:** verificar CI y SHAs del candidato/#6; con acceso efectivo al alojamiento sin costo, ejecutar controles sintéticos del servicio y luego el recorrido autenticado en preview del mismo proyecto. Revisar Safari, conteos operativos y rollback antes de proponer la promoción concreta. Guía ejecutable: [PUBLICACION_HIBRIDO_091.md](PUBLICACION_HIBRIDO_091.md). No migraciones, escrituras/borrados operativos, cambios Prestify, merges, despliegue manual ni gastos realizados en esta preparación.

---

Relevo previo de producción conservado en Git: [CURRENT_WORK de main base](https://github.com/FernandoDelgadoDiaz/Estimapres/blob/a7006e48476226976d8b698881ac5274eb568a7d/docs/CURRENT_WORK.md). La historia del laboratorio permanece en #60.
