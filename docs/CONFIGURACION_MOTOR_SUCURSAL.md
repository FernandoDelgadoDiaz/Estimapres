# Configuración editable del motor por sucursal (AH2-042)

**Estado: PROPUESTO — pendiente de aprobación del propietario.** El código está listo y probado; la migración
`supabase/migrations/20261121120000_configuracion_motor_sucursal.sql` está **preparada y no aplicada**. Mientras
no se aplique, la aplicación sigue usando la configuración del servicio (Secret Manager) sin cambios de comportamiento.

## Problema

La configuración privada del motor híbrido de la 091 (perfiles EVENTUAL, topes 12/8, excepción de apertura,
condiciones del supervisor) vive hoy en Secret Manager con vigencia de una sola semana (23–29/11/2026). Cada semana
habría que cargar una versión nueva. El propietario pidió: sin Secret Manager, sin recargas semanales, distinguiendo
reglas permanentes de excepciones temporales.

## Diseño

Tabla `configuracion_motor_sucursal` en Supabase (al-iada horarios), RLS por usuario autenticado no anónimo, sin
política de borrado (historial completo). Cada fila:

| Campo | Significado |
|---|---|
| `clase` | `permanente` (vigencia abierta) o `temporal` (excepción con fecha de fin obligatoria) |
| `tipo` | `topes_caja_eventual_contrato`, `perfil_caja_eventual`, `excepcion_apertura_aux_unico`, `condicion_supervisor` |
| `colaborador_id` | persona (perfiles y condiciones); nulo para reglas de sucursal |
| `vigencia_desde` / `vigencia_hasta` | fechas; una permanente se cierra solo al reemplazarla |
| `datos` | contenido en el mismo formato que ya valida el motor |
| `activa`, `motivo` | desactivación sin borrar; motivo visible en la traza |

### Resolución por semana (`src/hibrido/configuracionPersistente.ts`)

- Una fila rige si está activa, es de la sucursal y está vigente el **lunes** de la semana. Las condiciones del
  supervisor (que el motor evalúa por fecha) se incluyen si su vigencia se superpone con la semana.
- **Precedencia por alcance** (tipo + persona): excepción temporal > permanente; dentro de la misma clase, la de inicio
  más reciente. Dos filas de igual clase e inicio para el mismo alcance → error `AMBIGUA` (nunca se elige una en silencio).
- Salida: exactamente los campos que el motor ya acepta (`disponibilidad_caja_eventual`, `topes_caja_eventual_contrato`,
  `excepcion_apertura_aux_unico`, `condiciones_supervisor`) con vigencia de la semana. **El motor matemático no cambia.**
- Lo no configurado no se envía; no hay valores por defecto inventados.

### Fuente efectiva (`configuracionAutenticada`)

1. Si la sucursal tiene **alguna fila activa** guardada → es la **única** fuente (no se mezcla con Secret Manager).
2. Si no hay filas o la tabla no existe → configuración del servicio (transición, comportamiento actual).
3. El servicio CP-SAT se sigue consultando para verificar identidad, sucursal y origen.

Nueva semana muestra qué fuente se usó. La edición de topes en Nueva semana sigue siendo **solo para esa generación**.

### Edición (Reglas → Configuración del motor)

Visible solo donde el híbrido está habilitado (hoy 091). Permite:
- agregar una regla permanente; si ya existe una permanente vigente del mismo alcance, se **reemplaza desde la fecha
  indicada** (la anterior se cierra el día previo);
- agregar una excepción temporal (reemplaza a la permanente solo durante sus fechas);
- desactivar sin borrar; ver historial;
- **Ver semana**: lista exacta de reglas que recibirá el motor para un lunes dado;
- **Importar la configuración actual del servicio** (una vez): propone perfiles, topes y apertura como permanentes
  desde su inicio y las condiciones del supervisor como excepciones temporales con sus fechas; el supervisor revisa y
  confirma. Probado localmente con la configuración real de la 091: la semana 23–29/11 resulta idéntica a la actual y
  en las semanas siguientes las permanentes siguen vigentes sin la exclusión temporal.

Alcance de la interfaz en esta entrega: perfiles «toda la presencia» / «no atiende caja», contrato de origen y máximo
individual opcional; condiciones «gestionar manualmente» y «franco obligatorio». Reservas horarias de función habitual
(`PRESENCIA_MENOS_RESERVAS`) se aceptan en datos e importación, pero no tienen editor visual todavía.

## Aplicación (requiere aprobación)

1. Aprobar este documento y el PR.
2. Aplicar la migración en el proyecto Supabase al-iada horarios.
3. Publicar el frontend (Netlify al-iada, deploy manual con producción bloqueada).
4. En Reglas → Configuración del motor: «Importar la configuración actual del servicio», revisar, confirmar.
   Revisar que los perfiles importados como permanentes sigan siendo correctos para semanas futuras.
5. Verificar «Ver semana» para la próxima semana y generar con el motor híbrido.
6. Opcional, después de una semana estable: dejar `ah2-pilot-options` en `{}` (deja de usarse si hay filas guardadas).

## Rollback

- Interfaz: desactivar filas → si no queda ninguna activa, vuelve a regir la configuración del servicio.
- Frontend: republicar el deploy anterior en al-iada.
- Base: `drop table public.configuracion_motor_sucursal; drop function public.cms_tocar_actualizado();`
  (solo si no hay datos que conservar). No afecta otras tablas ni Prestify.

## Pruebas

`src/hibrido/__tests__/configuracionPersistente.test.ts` (14): permanentes en semanas sucesivas, excepción temporal y
retorno a la permanente, perfiles por persona, condiciones por superposición, ambigüedad, sucursal ajena, reemplazo
con cierre del día previo, validaciones, importación y reproducción exacta, compatibilidad con
`compilarDisponibilidadCaja`/`compilarCondiciones`, capa de datos (tabla ausente, ámbito, escrituras) y precedencia
persistida > servicio en el flujo integrado. `integracionExistente.test.ts` actualizada para declarar la fuente.
