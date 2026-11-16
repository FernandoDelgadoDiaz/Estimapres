# Propuesta P2 — Publicación oficial desde el servidor

**Estado:** PROPUESTO. El diseño v3.1 (§5.2, §5.4, §10.2 y §10.4) y el MASTER (AH2-029 y AH2-030) establecen la frontera. La integración de P2 y la publicación oficial requieren autorización propia. B1 aporta reglas de dominio puras.

## Frontera de confianza

La Netlify Function `publicar` verifica el JWT con Supabase Auth, toma de él la identidad y verifica el rol y la membresía para la sucursal solicitada. Lee las entradas persistidas, calcula sus huellas, verifica los días congelados y ejecuta el mismo validador TypeScript versionado. La identidad, la revisión y la evidencia de validación transmitidas a la operación de base las construye el servidor.

La operación `publicar_version` se ejecuta con una credencial exclusiva de la Function. La API del cliente conserva permisos acotados a la sucursal y a las operaciones de borrador. Los estados privilegiados, campos de aprobación, evidencias de validación, publicaciones, tramos y auditoría quedan protegidos contra escritura directa. La validación del JWT y el permiso de ejecución en PostgreSQL son controles separados.

## Vías evaluadas

| Vía | Invocación | Permisos |
|---|---|---|
| Preferida, esquema privado fuera de la Data API | Conexión PostgreSQL desde la Function, directa o mediante pooler | Rol dedicado con `USAGE` en el esquema y `EXECUTE` sobre la firma exacta. Sin privilegios directos sobre las tablas de publicación. |
| Alternativa, esquema expuesto en la Data API | RPC por PostgREST con un rol exclusivo de servidor | Revocar `EXECUTE` a `PUBLIC`, `anon`, `authenticated` y verificar concesiones heredadas y sobrecargas. Evaluar el alcance de `service_role` antes de admitirlo en un proyecto compartido. |

La RPC vía PostgREST exige un esquema expuesto. P0 verifica conexión, permisos efectivos y aislamiento respecto de Prestify antes de elegir la vía. Si la función SQL requiere `SECURITY DEFINER`, el diseño debe fijar un `search_path` seguro, calificar objetos y usar un propietario con los permisos mínimos. La credencial se limita al servidor y queda fuera de `VITE_*`, del cliente y de los logs.

Referencias técnicas: [Esquemas personalizados de Supabase](https://supabase.com/docs/guides/api/using-custom-schemas) y [Permisos de funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Transacción

Con el bloqueo por sucursal, PostgreSQL comprueba otra vez la membresía y el rol del actor humano, los identificadores de sucursal y ciclo, y el estado APROBADO de una versión de servidor no legada. Contrasta, dentro de la transacción, las huellas y las revisiones o snapshots de entradas que revalidó la Function, incluida la revisión de vigencia. Si cambiaron los datos o los permisos, rechaza sin escribir. La aprobación queda ligada a la misma versión y huella.

Verifica los días congelados y la fecha mínima en la zona de la sucursal, registra la publicación, recorta e inserta los tramos y escribe la auditoría con el actor real. La restricción de exclusión sobre intervalos efectivos impide solapamientos incluso bajo concurrencia. La Function devuelve el error si falla cualquier paso.

## Aceptación P2

- Los roles de cliente, incluido un aprobador autenticado, carecen de ejecución y de escrituras directas sobre los datos protegidos.
- Una solicitud sin membresía o con rol insuficiente se rechaza. Una revocación entre la validación y la escritura también se respeta.
- Las modificaciones de entradas, aprobación o vigencia entre la lectura y el comienzo de la transacción hacen fallar la operación sin cambios parciales.
- Dos publicaciones concurrentes con la misma revisión resultan en un éxito y un conflicto. Los tramos efectivos conservan su unicidad y los días anteriores permanecen intactos.
- La auditoría registra la identidad humana. Los artefactos de frontend carecen de credenciales privilegiadas.

B1 permite probar estados, huellas, recortes, fechas, revisión optimista y jornadas congeladas con datos sintéticos. La autenticación, la frontera de ejecución y la atomicidad deben verificarse en P2.
