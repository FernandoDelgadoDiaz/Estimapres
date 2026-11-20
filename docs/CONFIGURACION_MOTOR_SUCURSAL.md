# Configuración editable del motor por sucursal (AH2-042)

**Estado:** concepto **APROBADO** por el propietario (20/11/2026). Dos rondas de correcciones del propietario implementadas
y validadas (la segunda: sin prorrateo de máximos semanales, sin retorno automático a Secret Manager, condiciones día por
día y excepción de AUX único sin franja fija).
La migración `supabase/migrations/20261121120000_configuracion_motor_sucursal.sql` está **preparada y NO aplicada**.
Mientras no se aplique, Horarios sigue usando la configuración del servicio (Secret Manager) sin cambios.
Prestify no cambia. El motor solo cambia en un punto pedido expresamente por el propietario: la excepción de AUX único
ya no está fija en 08:00–09:00 (ver «Excepción de AUX único» abajo); con la configuración actual de la 091 el resultado es
idéntico.

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
| Perfil de caja EVENTUAL | `disponibilidad_caja_eventual` (un perfil semanal por persona) | Días sin acreditación → reserva de franja completa; días «presencia menos reservas» → sus reservas de ese día; «toda la presencia» → sin reservas. **Máximo individual y mínimo de función habitual son semanales y NO se prorratean:** si difieren entre días con caja de la misma semana → conflicto explícito. Contrato de origen distinto dentro de la semana → conflicto. |
| Topes por contrato de origen | `topes_caja_eventual_contrato` | **No se prorratean.** Se configuran por semanas completas (inicio lunes, fin domingo); la base y el cliente rechazan otras vigencias. Si datos cargados a mano cambiaran dentro de una semana → conflicto. |
| Excepción de AUX único | `excepcion_apertura_aux_unico` (matriz día × franja) | Franjas autorizadas **por día** (día, desde, hasta), **sin franja fija**. |
| Condiciones del supervisor | `condiciones_supervisor` con fechas exactas por tramo y `turnos` | **Día por día por alcance (tipo de condición + persona):** la excepción temporal rige en sus días y la permanente en los demás; cada tramo continuo se envía con sus fechas. Un turno con el mismo nombre y otra definición en la misma semana recibe una clave propia. «Gestionar manualmente» y «franco y medio corrido» deben regir la semana completa (regla del motor) → si no, conflicto explicado. |

**Integridad entre reglas:** una regla inválida o un conflicto se informan en **su** alcance; el resto se resuelve igual.
Si la semana a generar tiene conflictos, se bloquea **solo** la generación híbrida con el detalle (el motor anterior
sigue disponible); nunca se envía una configuración parcial. Antes de escribir, cada cambio se **simula** sobre las
semanas afectadas y se rechaza si crearía un conflicto nuevo: guardar, cambiar o desactivar una regla no puede invalidar
otras.

**Fuente efectiva:** en cuanto la sucursal guarda o importa su configuración (cualquier fila, activa o no), la
configuración guardada es la **única** fuente **para siempre**: desactivar reglas **nunca** devuelve la sucursal a Secret
Manager (sin reglas vigentes, el motor recibe solo lo vigente). Solo una sucursal que nunca guardó configuración (o sin la
tabla) usa la del servicio, como transición. Nueva semana indica cuál se usó.

## Excepción de AUX único (motor A y CP-SAT)

Corrección del propietario: la excepción ya no está fija en 08:00–09:00. En **cualquier franja autorizada por la sucursal**,
si hay **un único AUX presente**, puede atender caja sentado sin otro supervisor de pie (cuenta como hora-caja AUX). En
todo lo demás rigen las reglas aprobadas sin cambios: H-A2 (≥1 AUX de pie 09:00–22:00) fuera de las franjas autorizadas o
con dos o más AUX; R3 (el supervisor de jornada completa no se sienta); H-A3 (sin AUX en caja después del cierre); sin
AUX presente sigue siendo infracción. Cambiado en A (`politicaRecursos`, pasada 2, máscaras AH2-040, comparabilidad,
validador independiente, salida) y en B (`support`, `domain`, máscaras, comparación); probado con el mismo caso en ambos.
Con matrices que solo autorizan la apertura, todas las pruebas y resultados previos quedan idénticos.

## Editor (Reglas → Configuración del motor)

Visible donde el híbrido está habilitado (hoy 091, por la activación de AH2-041). Para cada regla: **Cambiar** (desde una
fecha, con historial) y **Desactivar** (con control de versión). Formularios:

- **Máximos semanales EVENTUAL** por contrato FULL/PART, activables (desactivado = sin máximo, no 0 h).
- **Disponibilidad de caja de un EVENTUAL:** toda la presencia / presencia menos reservas / no atiende caja; contrato de
  origen; horas de contrato; máximo individual; **reservas horarias de función habitual** (días + desde/hasta) y mínimo
  semanal de función habitual.
- **AUX único:** lista de franjas autorizadas por día (día, desde, hasta) sobre la grilla del motor, sin franja fija.
- **Condiciones del supervisor:** franco un día, turno (nombre + ingreso desde/hasta + salida máxima), gestionar
  manualmente, máximo de francos simultáneos, franco y medio corrido; prioridad DEBE o PREFERIRÍA según el motor.
- **Ver semana:** reglas que rigen y en qué días, conflictos y notas de composición.
- **Importar la configuración actual del servicio** (una vez, con revisión y confirmación; todo o nada).

## Validación

- `src/hibrido/__tests__/configuracionPersistente.test.ts` — 31 pruebas, con **regresiones específicas** de la segunda
  ronda: (1) sin prorrateo — topes solo por semanas completas, perfil con máximo distinto un día → conflicto, igual valor →
  se conserva; (2) después de importar, desactivar todo no vuelve a Secret Manager; (3) excepción temporal de turno a mitad
  de semana reemplaza a la permanente solo esos días (verificado con `compilarCondiciones`), otros tipos/personas no se
  reemplazan, turno homónimo con otra definición; (4) franjas libres de AUX único aplicadas en sus franjas exactas. Además:
  composición de perfiles por fecha, condiciones del motor, aislamiento de conflictos, simulación previa, funciones atómicas,
  importación y formularios del editor.
- `src/hibrido/__tests__/excepcionApertura.test.ts` y `aliada-optimizer/tests/test_excepcion_apertura.py` — mismo caso en
  A y CP-SAT: un único AUX en una franja autorizada fuera de la apertura atiende caja; sin autorización (o en otro día) queda
  de pie; A valida el plan de CP-SAT y rechaza sentar al AUX fuera de la franja (H-A2). Fixture compartido.
- `supabase/tests/configuracion_motor_sucursal.test.sql` + `scripts/db/probar-configuracion-motor.sh` (también en CI,
  job `database`): migración real en Postgres efímero; superposición rechazada, alcance de condiciones por tipo y persona,
  topes solo por semanas completas, escritura directa prohibida, reemplazo
  atómico (incluido el fallido sin cambios), versión obsoleta rechazada, desactivación aislada, importación todo-o-nada,
  aislamiento entre usuarios y sesiones anónimas, y **concurrencia real con dos sesiones** (la segunda recibe
  `CONFLICTO_CONCURRENTE`, una sola versión nueva).
- Importación verificada localmente con la configuración real de la 091 (sin versionarla): semana 23–29/11 idéntica a la
  del servicio; semana siguiente sin conflictos, con las permanentes y sin las temporales.

## Aplicación (requiere aprobación)

0. **CP-SAT:** reconstruir la imagen de Cloud Run con el SHA de aliada-optimizer que incluye la excepción sin franja fija
   (ver CURRENT_WORK) y desplegar una revisión nueva. Sin esto, CP-SAT rechaza franjas fuera de 08:00–09:00 y Horarios
   usa el motor A (válido, sin la mejora de CP-SAT).
1. Aprobar el PR.
2. Autorizar la aplicación de la migración en Supabase al-iada horarios (requiere `btree_gist`, disponible en Supabase).
3. Fusionar y publicar al-iada (Publish deploy con producción bloqueada).
4. Reglas → Configuración del motor → Importar → revisar → Confirmar. Confirmar si los perfiles EVENTUAL (ratificados para
   23–29/11) deben quedar permanentes.
5. «Ver semana» para la próxima semana y generar.

## Rollback

- Desactivar o cambiar reglas desde el editor (no vuelve a Secret Manager).
- Republicar el deploy anterior de al-iada.
- Base (solo sin datos que conservar): ver el bloque de rollback al final de la migración.
