# Publicación controlada del motor híbrido 091

Autoridad: MASTER AH2-041. Este documento prepara la salida; no declara publicación ni servicio disponible.

## Candidato aislado

Rama `feat/ah2-hibrido-integrado-091`, desde `main` exacto `a7006e48476226976d8b698881ac5274eb568a7d`. Extrae las dependencias del motor validado de #60 sin fusionar ese PR entero. No incluye páginas de laboratorio, contingencias, ciclos offline ni sitio piloto. `src/utils/generacionMultiArranque.ts`, `netlify.toml`, funciones de pago y archivos de Prestify quedan idénticos a esa base. No cambian dependencias ni lockfile.

Se reutilizan contrato, A/CP-SAT, selección independiente, DIAS, protección de picos, equilibrio y editor de topes. El flujo de Nueva semana sigue siendo el habitual. Dos respaldos: A validado si B no devuelve una mejora utilizable; selector del generador anterior antes de cada ejecución. Si falla la autorización/configuración no se envía la dotación: se informa el problema y el supervisor puede seleccionar el anterior. Nunca denominar A solo como A+B efectivo.

## Configuración de salida (solo proyecto Netlify al-iada)

- Mantener las variables Supabase públicas existentes. No agregar claves privilegiadas ni IDs personales al bundle.
- `VITE_AH2_HIBRIDO_091=true` y `VITE_AH2_OPTIMIZER_URL=https://<servicio-CP-SAT-verificado>` habilitan únicamente la 091. Sin ambos, permanece el generador anterior. Son variables de build: cambiarlas requiere reconstruir/republicar. El selector permite el respaldo inmediato por generación.
- Servicio existente de `aliada-optimizer`: reutilizar Dockerfile/HTTP, sin otro frontend. Auth verifica cada JWT contra Supabase; lista cerrada de usuario/sucursal y **origen exacto** de Horarios. `SUPABASE_PUBLIC_KEY` es pública, nunca service_role. `AH2_ALLOWED_USER_ID` solo en servidor. `AH2_ALLOWED_BRANCH=091`. Origen productivo observado: `https://horarios.aliadaapps.com`; usar una sola URL canónica y no comodines. Un preview requiere su origen exacto antes de enviar datos; no ampliar CORS globalmente.
- `AH2_PILOT_OPTIONS` conserva su nombre técnico por compatibilidad, pero es la configuración privada del motor integrado, no otra aplicación. Incluir perfiles EVENTUAL, topes 12/8 aprobados, condiciones manuales y excepción de apertura; no nombres, POM ni resultados. Se entrega por `/v1/sesion` solo después de Auth/origen/usuario. La configuración privada ya preparada se recupera como `Aliada_091_S48_config_piloto_privada.json`; no subirla al repo ni al frontend. Revisar vigencias y semana solicitada: no renovar condiciones ni acreditar personas automáticamente.
- La edición de topes en Nueva semana es por generación. El valor base se conserva en la configuración privada; no se crea una tabla ni una recarga semanal obligatoria. El historial existente guarda el snapshot aplicado en su jsonb, para revalidar al editar/exportar; no se han escrito datos reales durante preparación.

## Controles antes de publicar

1. Fijar SHA de frontend y backend y checks aprobados. Mantener bloqueada la publicación automática de ambos proyectos. Verificar que `main` no cambió desde la base o actualizar el candidato sin perder controles.
2. **Bloqueo actual:** no existe un servicio CP-SAT desplegado. Netlify está accesible; Cloud Run/Cloud Shell no abren en esta sesión. Falta acceso operativo a infraestructura del propietario que ejecute el contenedor sin habilitar facturación ni gastos. No crear otra app ni cambiar de proveedor/contratar para sortearlo. Resolver este único alojamiento antes de activar la variable. No publicar un frontend que simule B.
3. Con servicio efectivo: health, ausencia de JWT, identidad ajena, sesión anónima, origen/sucursal incorrectos y respuesta inválida, primero con datos sintéticos. Contenedor no root, concurrencia uno, límites de tamaño/tiempo y sin logs/persistencia de solicitudes. No usar el puente Vite.
4. RLS real fue revisada en lectura: usuario permitido ve 15 activos y 5 reglas; otro usuario, anon y sesión anónima ven cero. Fueron transacciones READ ONLY/ROLLBACK con roles/claims, no login real en Safari. Completar la sesión real y el recorrido integrado en preview del mismo proyecto, con su origen acotado, sin guardar la prueba. La configuración debe corresponder a las fichas reales actuales; la aplicación relee Supabase y rechaza una copia anterior antes de optimizar.
5. Reutilizar checkpoint/POM ya validados; no recalcular el benchmark para demostrar de nuevo 355/402 h, 47 faltantes y cero sobrantes. Verificar el cableado nuevo y PDF, topes, cancelación, fallback y relectura. Safari físico sigue pendiente. Sin domingo real confirmado, la propuesta queda SIN VERIFICAR y no se guarda operativamente.
6. Registrar conteos acotados de `colaboradores`, `reglas_configurables`, `semanas_historial`, `correcciones_manuales`, `aprendizajes_derivados` inmediatamente antes y después; mismo alcance usuario/sucursal. No migraciones, borrados ni cambios en funciones de pago.
7. Solo entonces preparar/promover el deploy del SHA aprobado **en al-iada** y comprobar ese SHA, sesión, POM → A+B efectivo → selección → PDF. No desbloquear ni publicar Prestify. Esta preparación no ejecuta la promoción.

## Rollback verificado en lectura

El 20/11/2026 se observó el deploy de Horarios **publicado y bloqueado** `6afba0e1c0b8e64caa476f2c`, commit `a7006e48476226976d8b698881ac5274eb568a7d`. Dashboard: <https://app.netlify.com/projects/al-iada/deploys/6afba0e1c0b8e64caa476f2c>. Netlify también mostró el botón `Publish deploy` en el deploy anterior `6afaf00277b0e34b044ff917`. No se pulsó ningún control de publicación, desbloqueo ni rollback.

- Respaldo inmediato: cancelar la generación, seleccionar **Usar motor anterior para esta generación** y volver a generar.
- Desactivación global del híbrido: build del mismo SHA con `VITE_AH2_HIBRIDO_091=false`, comprobarlo y publicar solo en al-iada. No elimina semanas existentes ni sus snapshots.
- Rollback del frontend: republicar el deploy base `6afba0e1c0b8e64caa476f2c`, mantenerlo bloqueado y comprobar el commit `a7006e4`. No depende de reconstruir ni ejecutar CP-SAT. No restaura ni revierte datos: no hay migración en esta entrega.
- Prestify se observó con auto publicación bloqueada y SHA publicado `905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. Su dominio/proyecto/env/deploy no se modifican. El repositorio compartido puede producir previews automáticos; eso no autoriza promoverlos ni desbloquear producción.

## Evidencia previa que se conserva

Motor A/equilibrio: `aa410f74717e5c02bc7041204354a99cce8dedeb`, CI `44767440886`. CP-SAT/contenedor: `361d7271b417d55a8a80fa10b104697d19de2d61`, CI `44767721664`. Formulación, comparaciones y pruebas anteriores permanecen en #60/#6; no se rehacen. El resultado completo real fue FACTIBLE, no óptimo total demostrado ni certificación jurídica.
