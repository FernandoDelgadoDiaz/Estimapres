# Configuración editable del motor por sucursal (AH2-042)

**Estado:** concepto **APROBADO** por el propietario (20/11/2026). Correcciones solicitadas implementadas y validadas.
La migración `supabase/migrations/20261121120000_configuracion_motor_sucursal.sql` está **preparada y NO aplicada**.
Mientras no se aplique, Horarios sigue usando la configuración del servicio (Secret Manager) sin cambios.
El motor matemático (A, CP-SAT, contrato, validadores) y Prestify no cambian.

## Qué resuelve

Sin recargas semanales ni Secret Manager: la configuración privada del motor (perfiles EVENTUAL, topes por contrato de
origen, excepción de apertura, condiciones del supervisor) se guarda por sucursal en Supabase y distingue:

- **Regla permanente:** vigencia abierta. Rige **cada día** desde su inicio, todas las semanas.
- **Excepción temporal:** con fecha de fin. Rige **día por día** dentro de sus fechas, aunque empiece o termine a mitad de
  semana, y esos días reemplaza a la permanente del mismo alcance (tipo + persona, o identificador de la condición).

## Modelo de datos (migración)

Tabla `configuracion_motor_sucursal`: `local_id`, `sucursal_id`, `clase`, `tipo`, `colaborador_id`, `vigencia_desde`,
`vigencia_hasta`, `datos` (jsonb), `activa`, `motivo`, `version`, `reemplaza_a`, `creado_por`, `creado_en`,
`actualizado_en`, `desactivada_en`, y `alcance` (columna generada).

| Garantía | Cómo se asegura en la base |
|---|---|
| Aislamiento | RLS de lectura por `local_id = auth.uid()` y sesión no anónima. Toda consulta filtra por usuario y sucursal. |
| Sin ambigüedad | Restricción de exclusión `cms_sin_superposicion` (btree_gist): no puede haber dos reglas **activas** de la misma clase y alcance con fechas superpuestas. Permanente y temporal sí conviven (la temporal es la excepción). |
| Escrituras controladas | Sin INSERT/UPDATE/DELETE directos. Solo funciones `cms_crear`, `cms_reemplazar`, `cms_desactivar`, `cms_importar` (SECURITY DEFINER, identidad verificada, `search_path` vacío). Cada una toca únicamente las filas indicadas. |
| Atomicidad | `cms_reemplazar` cierra (o desactiva) la versión anterior e inserta la nueva en una sola transacción; si la nueva choca con otra regla, **no queda ningún cambio**. `cms_importar` es todo o nada. |
| Concurrencia | Control optimista por `version` + `SELECT … FOR UPDATE`. Si otra pestaña o persona cambió la regla → `CONFLICTO_CONCURRENTE` y nada se modifica. |
| Historial | Nunca se borra: reemplazar cierra la anterior (`vigencia_hasta` = día previo) o la desactiva, y la nueva apunta a ella (`reemplaza_a`). |
| Datos mínimos | `CHECK` por tipo (claves obligatorias, temporal con fin, fechas ordenadas, alcance coherente con el tipo). |
| Escala | Un único esquema para todas las sucursales; índice `(local_id, sucursal_id, activa, vigencia_desde)`; ningún dato ni horario de sucursal en el código. |

## Resolución por fecha (`src/hibrido/configuracionPersistente.ts`)

Para cada alcance y cada fecha de la semana rige la excepción temporal vigente ese día; si no hay, la permanente
vigente de inicio más reciente. El resultado se expresa **solo** en los formatos que el motor ya valida:

| Configuración | Salida al motor | Cambios dentro de la semana |
|---|---|---|
| Perfil de caja EVENTUAL | `disponibilidad_caja_eventual` (un perfil semanal por persona) | Días sin acreditación → reserva de franja completa; días «presencia menos reservas» → sus reservas de ese día; «toda la presencia» → sin reservas. Máximo individual y mínimo de función habitual se prorratean por día (un día sin máximo aporta 84/7 h). Contrato de origen distinto dentro de la semana → conflicto (los topes por contrato son semanales). |
| Topes por contrato de origen | `topes_caja_eventual_contrato` | Prorrateo por días; un día sin máximo (regla desactivada o sin regla) aporta 84/7 h, máximo admitido por el motor. |
| Excepción de apertura | `excepcion_apertura_aux_unico` (matriz día × franja) | Franjas configuradas **por día** (día, desde, hasta). La franja admitida la decide el **validador del motor** (hoy, la apertura del día): una franja no admitida se rechaza al guardar con el mensaje del motor. |
| Condiciones del supervisor | `condiciones_supervisor` con sus fechas reales y `turnos` | El motor ya las evalúa por día. «Gestionar manualmente» y «franco y medio corrido» deben cubrir la semana completa (regla del motor): si no, conflicto con indicación de usar «franco obligatorio». |

**Integridad entre reglas:** una regla inválida o un conflicto se informan en **su** alcance; el resto se resuelve igual.
Si la semana a generar tiene conflictos, se bloquea **solo** la generación híbrida con el detalle (el motor anterior
sigue disponible); nunca se envía una configuración parcial. Antes de escribir, cada cambio se **simula** sobre las
semanas afectadas y se rechaza si crearía un conflicto nuevo: guardar, cambiar o desactivar una regla no puede invalidar
otras.

**Fuente efectiva:** si la sucursal tiene alguna regla activa guardada, es la **única** fuente. Sin reglas (o sin la
tabla) rige la configuración del servicio. Nueva semana indica cuál se usó.

## Editor (Reglas → Configuración del motor)

Visible donde el híbrido está habilitado (hoy 091, por la activación de AH2-041). Para cada regla: **Cambiar** (desde una
fecha, con historial) y **Desactivar** (con control de versión). Formularios:

- **Máximos semanales EVENTUAL** por contrato FULL/PART, activables (desactivado = sin máximo, no 0 h).
- **Disponibilidad de caja de un EVENTUAL:** toda la presencia / presencia menos reservas / no atiende caja; contrato de
  origen; horas de contrato; máximo individual; **reservas horarias de función habitual** (días + desde/hasta) y mínimo
  semanal de función habitual.
- **Apertura con AUX único:** lista de franjas por día (día, desde, hasta) sobre la grilla del motor.
- **Condiciones del supervisor:** franco un día, turno (nombre + ingreso desde/hasta + salida máxima), gestionar
  manualmente, máximo de francos simultáneos, franco y medio corrido; prioridad DEBE o PREFERIRÍA según el motor.
- **Ver semana:** reglas que rigen y en qué días, conflictos y notas de composición.
- **Importar la configuración actual del servicio** (una vez, con revisión y confirmación; todo o nada).

## Validación

- `src/hibrido/__tests__/configuracionPersistente.test.ts` — 28 pruebas: vigencia por fecha (excepción miércoles–viernes,
  permanente que empieza a mitad de semana, prorrateos), composición de perfiles y compilación por el motor, apertura
  configurable y rechazo por el validador del motor, todas las condiciones compiladas por `compilarCondiciones`,
  aislamiento de conflictos por alcance, simulación previa, funciones atómicas con versión y mapeo de errores,
  importación todo-o-nada, formularios del editor, precedencia persistida > servicio y bloqueo con detalle.
- `supabase/tests/configuracion_motor_sucursal.test.sql` + `scripts/db/probar-configuracion-motor.sh` (también en CI,
  job `database`): migración real en Postgres efímero; superposición rechazada, escritura directa prohibida, reemplazo
  atómico (incluido el fallido sin cambios), versión obsoleta rechazada, desactivación aislada, importación todo-o-nada,
  aislamiento entre usuarios y sesiones anónimas, y **concurrencia real con dos sesiones** (la segunda recibe
  `CONFLICTO_CONCURRENTE`, una sola versión nueva).
- Importación verificada localmente con la configuración real de la 091 (sin versionarla): semana 23–29/11 idéntica a la
  del servicio; semana siguiente sin conflictos, con las permanentes y sin las temporales.

## Aplicación (requiere aprobación)

1. Aprobar el PR.
2. Autorizar la aplicación de la migración en Supabase al-iada horarios (requiere `btree_gist`, disponible en Supabase).
3. Fusionar y publicar al-iada (Publish deploy con producción bloqueada).
4. Reglas → Configuración del motor → Importar → revisar → Confirmar. Confirmar si los perfiles EVENTUAL (ratificados para
   23–29/11) deben quedar permanentes.
5. «Ver semana» para la próxima semana y generar.

## Rollback

- Desactivar reglas: sin reglas activas vuelve a regir la configuración del servicio.
- Republicar el deploy anterior de al-iada.
- Base (solo sin datos que conservar): ver el bloque de rollback al final de la migración.
