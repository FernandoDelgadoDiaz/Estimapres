# RIESGO P2 — La RPC de publicación no debe poder invocarse desde el navegador

**Estado:** PROPUESTO. Se documenta en B1 por pedido del propietario. **No se implementa en B1:** no hay migraciones, ni cambios en Supabase o Netlify, ni publicación oficial.

**Referencias:**
- diseño v3 (PR #46): §5.2, §5.4, §10.2 y §10.4;
- AH2-029 (prueba local frente a oficial);
- AH2-030 (vigencia por intervalos).

## 1. Riesgo

El diseño v3 propone publicar así:
1. la Netlify Function `publicar` verifica la identidad y revalida con el validador independiente;
2. después llama a una RPC transaccional `publicar_version`.

**Problema:** Supabase expone por PostgREST (`/rest/v1/rpc/<función>`) toda función del esquema `public` que el rol `authenticated` pueda ejecutar.

Si la Function llama a la RPC **con el JWT del usuario** (como sugiere §10.4 del diseño v3), ese mismo usuario puede llamarla **directamente desde el navegador**. Así se salta la revalidación en el servidor y publica algo no validado o con una huella falsa.

Esto rompe:
- I0: solo el servidor publica;
- I2: solo se publica lo validado en el servidor.

Las políticas de acceso de las tablas no alcanzan para impedirlo: la RPC escribe en `versiones_horario` y `tramos_vigencia` en nombre del usuario.

## 2. Solución recomendada (para P2)

**La RPC solo la ejecuta la Function**, que asume la verificación de identidad y permisos. La RPC repite los controles críticos como defensa en profundidad.

1. **La RPC queda fuera de la API pública:**
   - va en un esquema **no expuesto** por PostgREST (por ejemplo, `aliada_priv`, que no figura en `db-schemas` de la API);
   - `revoke execute on function aliada_priv.publicar_version(...) from public, anon, authenticated;`
   - `grant execute ... to service_role;` o a un rol dedicado que solo usa la Function.
2. **La Function `publicar`:**
   - **verifica el JWT** del usuario (`auth.getUser(jwt)`) y obtiene su `usuario_id`;
   - comprueba su **membresía y rol** en la sucursal (rol aprobador, director regional o admin de empresa, según la política);
   - **revalida** la versión con el mismo validador TypeScript versionado y recalcula la **huella** de las entradas guardadas, sin confiar en ninguna huella enviada por el cliente;
   - llama a la RPC con el rol de servicio y pasa `p_actor = usuario_id`, `p_revision_esperada`, `p_huella_validada` y `p_validador_version`.
3. **La RPC (`security definer` con `search_path` fijo), en una transacción:**
   - toma `pg_advisory_xact_lock` por sucursal;
   - **vuelve a comprobar** la membresía y el rol de `p_actor` (defensa en profundidad);
   - verifica que la versión esté APROBADA, sea de ámbito servidor y no sea legada;
   - verifica que `p_huella_validada` coincida con la huella guardada;
   - verifica la revisión de vigencia (control optimista);
   - verifica que los días anteriores al reemplazo queden congelados y que el reemplazo empiece como mínimo mañana en la zona horaria de la sucursal;
   - recorta e inserta tramos;
   - la restricción de exclusión `btree_gist` es la última barrera contra solapamientos;
   - registra los eventos en `eventos_auditoria`, incluido el actor real (`p_actor`), no el rol de servicio.
4. **Secretos:**
   - la clave de servicio vive **solo** en las variables de entorno de la Function (Netlify, sin prefijo `VITE_`) y nunca llega al bundle del navegador;
   - **un control de CI** falla si aparece en `dist/`.
5. **Escrituras directas cerradas:**
   - `revoke insert, update, delete` sobre `tramos_vigencia` y `publicaciones` para `anon` y `authenticated`;
   - una política que impide poner `estado = 'PUBLICADO'` en `versiones_horario` desde el cliente.

**Corrección al diseño v3:** §10.4 decía «la Function usa el JWT del usuario, sin clave de servicio». Con esta solución, la Function **verifica** el JWT, pero llama a la RPC **con un rol de servicio restringido**. Las políticas de acceso siguen protegiendo todas las lecturas y escrituras del cliente; la RPC privada aplica los controles de identidad por su cuenta. Este cambio se incorpora al diseño cuando se integre el PR #46 o en P2.

## 3. Alternativa evaluada (no recomendada como primera opción)

**Token de revalidación firmado.** La Function firma con HMAC `{versionId, huella, validadorVersion, actor, exp}` usando un secreto que solo conocen la Function y la base. La RPC, ejecutable por `authenticated`, verifica la firma con `pgcrypto`.

- **A favor:** mantiene el JWT del usuario de punta a punta.
- **En contra:**
  - agrega gestión de secretos en la base;
  - un error de verificación abre la publicación directa;
  - la RPC sigue expuesta.

## 4. Pruebas de aceptación para P2

1. Llamar `/rest/v1/rpc/publicar_version` con un JWT de `authenticated` (incluso de un aprobador válido) → **rechazado**: la función no existe en la API o no hay permiso de ejecución.
2. Insertar o actualizar `tramos_vigencia` o `publicaciones`, o poner `PUBLICADO` en `versiones_horario`, desde el cliente → **rechazado**.
3. La Function con un JWT de usuario sin membresía o con un rol insuficiente → 403, sin escrituras.
4. La Function con una versión cuya huella recalculada no coincide → rechazada, sin escrituras.
5. Dos publicaciones concurrentes → una se publica y la otra recibe un conflicto; nunca hay solapamiento en la base.
6. La auditoría registra el actor humano real.
7. El bundle (`dist/`) no contiene la clave de servicio.

## 5. Relación con B1

B1 implementa en `src/planificacion/` las reglas puras que la RPC aplicará en SQL:
- máquina de estados;
- `PUBLICACION_LOCAL_PROHIBIDA`;
- `PUBLICACION_SIN_REVALIDACION_SERVIDOR`;
- recorte de tramos;
- `FECHA_NO_FUTURA`;
- `CONFLICTO_CONCURRENCIA`;
- `DIAS_CONGELADOS_MODIFICADOS`.

Esas funciones son la **especificación ejecutable** contra la que se probará la RPC. Ninguna de ellas publica ni escribe datos.
