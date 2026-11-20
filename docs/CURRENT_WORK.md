## PUNTO ÚNICO DE RETOMA — CP-SAT operativo para 091 en Cloud Run; falta solo la parte Netlify · 20/11/2026, Claude

**Hecho:** el propietario entregó el UID Supabase verificado y la configuración privada original de la 091 (perfiles EVENTUAL, topes 12/8, exclusión manual, excepción de apertura). Validada contra `Config` y `ev_caja` del backend `5b98417` antes de cargarla. Secret Manager: `ah2-allowed-user-id` v2 y `ah2-pilot-options` v2 (v1 provisorias **deshabilitadas**). Revisión **`aliada-optimizer-00002-b77`** sirve 100 % con esos secretos; arranque sin errores; controles negativos repetidos desde Cloud Build: 401 sin sesión/JWT inválido, 403 origen ajeno, preflight solo `https://horarios.aliadaapps.com`. Rollback del servicio: `gcloud run services update-traffic aliada-optimizer --region southamerica-east1 --to-revisions aliada-optimizer-00001-wvt=100` (revisión que rechaza todo) o borrar el servicio. Ningún dato personal en repositorios.

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
