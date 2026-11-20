# Piloto privado móvil: preparación, sin despliegue

20/11/2026. Autoridad: MASTER; continuidad: primera sección de CURRENT_WORK. No hay una URL nueva publicada.

## Preparado en código

- Entrada separada `piloto-horarios.html`; build `npx vite build --config vite.piloto.config.ts`, salida `dist-piloto`. No modifica el build ni las rutas productivas.
- Pantalla para iPhone: login de Supabase, dotación activa, carga directa del PDF POM con el lector existente y PDF.js sin evaluación dinámica; semana y «Estimado de cajas necesarias» del documento.
- `cargarDatosPiloto`: verifica usuario con Auth antes de consultar. Solo SELECT de colaboradores/reglas, filtrados por usuario y sucursal; RLS sigue siendo obligatoria. Sin importación automática, fallback local ni escrituras operativas. Relee antes de generar.
- Configuración privada de prueba en memoria y editor local de topes. Los perfiles y condiciones faltantes no se inventan. Carga de configuración opcional para los campos aún no persistidos; **no afirmar completado el flujo semanal sin carga adicional** hasta disponer de la configuración reutilizable. Persistencia diseñada, no aplicada: conservar perfiles y topes con ámbito, vigencia y versión en el perfil de sucursal, y comprobar solapamientos/autorización en el servidor; requiere etapa separada.
- Generación única A + CP-SAT por servicio HTTPS; token de sesión por solicitud, progreso, cancelación y respaldo A identificado cuando B falla. La pantalla no presenta un fallo de B como ejecución híbrida exitosa.
- PDF no oficial y cobertura diaria; sin aprobar, publicar ni guardar horarios. Sin descanso previo confirmado ni validación jurídica, se informa esa limitación.
- `netlify.piloto.toml` es una configuración para un **sitio nuevo separado**, no sustituye la de `al-iada` ni Prestify. Sin funciones de pago. Falta aplicarla al hosting autorizado.

## Servicio B preparado

En el PR #6: `Dockerfile`, `.dockerignore` y `optimizer/http_pilot.py`. Escucha `PORT`; `/healthz` no expone datos. `/v1/estado` y `/v1/optimizar` requieren sesión verificada por Supabase Auth, usuario permitido y origen HTTPS exacto. El sobre debe declarar la sucursal autorizada tanto en profile como en input. Límite 2 MB, una optimización simultánea por instancia, proceso hijo aislado, máximo de búsqueda 120 s y 20 s adicionales de sobrecarga. NDJSON de progreso y resultado; sin registros de solicitudes ni datos en disco. No utiliza el puente Vite.

Variables de servidor: `SUPABASE_URL`, `SUPABASE_PUBLIC_KEY` (clave pública, nunca service_role), `AH2_ALLOWED_USER_ID`, `AH2_ALLOWED_BRANCH`, `AH2_ALLOWED_ORIGIN`, `PORT`. Configuración incompleta = rechazo de arranque.

Variables del frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AH2_PILOT_USER`, `VITE_AH2_PILOT_BRANCH`, `VITE_AH2_PILOT_SERVICE`. No incluir dotación, perfiles de personas ni secretos en las variables que se incorporan al bundle. El listado explícito de usuario/sucursal es un control de piloto, no una plataforma de permisos multisucursal homologada.

Auth se comprueba consultando al servidor de Supabase con el token; no se autoriza usando metadatos editables ni decodificando un JWT sin verificar. Referencia: https://supabase.com/docs/reference/javascript/auth-getuser . Contrato del contenedor: https://docs.cloud.google.com/run/docs/container-contract . No se cotizan servicios ni se garantiza costo cero.

## Evidencia y pendientes reales

- Pruebas locales de HTTP con CP-SAT real y datos sintéticos, más rechazos de sesión, origen, otra sucursal, tamaño, hash y JSON.
- Tests A de identidad y SELECT acotados, errores sin fallback, filas fuera de ámbito, JWT y lectura NDJSON final sin salto de línea.
- Build separado compilado. Docker no está instalado localmente. **La imagen sí se construyó y ejecutó en CI**, con health HTTP y rechazo de solicitud no autorizada: CI 44767721664, código B `361d7271b417d55a8a80fa10b104697d19de2d61`. También se probó CP-SAT real por el servidor Python con entrada sintética.
- Chromium local no arranca por restricción del entorno (`socket() ... Operation not permitted`). **CI browser del código A `aa410f74717e5c02bc7041204354a99cce8dedeb` aprobada** (44767440886, 22 aprobadas / 2 omitidas), incluido bloqueo del piloto sin configuración a 390 px. El ensayo real autenticado en Safari físico sigue pendiente.
- **No se consultó Supabase real en esta sesión.** No se revalidaron políticas reales ni acceso de la cuenta desde la preview; las pruebas de aislamiento actuales son sintéticas.
- No se creó Google Cloud, sitio Netlify, recurso facturable, migración, gasto ni escritura operativa. No se transfirieron los datos reales al servicio externo.

## Próximo paso mínimo para una URL verificable

CI de código y contenedor satisfactoria. Siguiente: con autorización específica de infraestructura y del envío temporal de dotación/horarios al servicio privado: elegir proyecto existente autorizado o crear uno con facturación aceptada; construir/verificar la imagen, desplegar un servicio aislado con escala mínima cero, concurrencia y máximo de instancias limitados, y timeout de hosting superior al plazo del proceso. Crear preview separada, configurar usuario/sucursal y origen exactos en ambos lados, comprobar RLS real solo lectura e identidad negativa, y probar POM → híbrido real → PDF en iPhone. No usar producción ni habilitarla mientras falten estas comprobaciones. El alta de infraestructura y el envío de datos **siguen sin autorización en este relevo**.
