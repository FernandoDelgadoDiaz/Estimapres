# ALIADA HORARIOS 2.0 — TRAMO B: ciclos, aprobación, publicación y continuidad semanal

**Estado:** PROPUESTO. Documento de diseño, **sin implementación**.
- No incluye migraciones ni escrituras en Supabase o en datos operativos.
- No cambia el motor publicado ni toca Prestify.
- Las decisiones abiertas están listadas en §13 y las resuelve el propietario.

**Base:** `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea` (PR #45 integrado y publicado; ver CURRENT_WORK).
**Autoridad:** `docs/ALIADA_HORARIOS_MASTER.md`. Este documento se subordina a §6.1 y a AH2-008, AH2-012 y AH2-015…AH2-018. Si algo de lo que sigue los contradice, prevalece el MASTER.
**Issues:** #44 (arquitectura adaptativa, tramo B), #12 (PUB-01: flujo y PDF) y #10 (validador). La dependencia multisucursal es AH2-022.

> **Fuentes y límite.** El pedido del propietario remite a «el prompt anterior» para el alcance de 160 sucursales. Ese texto **no está** en el repositorio, en las Issues ni en el registro de esta sesión. El diseño se basa en MASTER §6.1, AH2-015, AH2-016, AH2-022 y las Issues #44 y #12. Si ese prompt tiene requisitos que aquí falten, se incorporan antes de aprobar.

---

## 1. Problema

Hoy cada generación guarda una **versión** por lunes (`SemanaHistorial.version`), pero el sistema no sabe:
- qué versión fue **aprobada** y **publicada**, ni quién lo hizo;
- desde y hasta cuándo rige cada horario (**vigencia**), en particular en sucursales con planificación **mensual** de 4 o 5 semanas;
- a qué **ciclo de planificación** pertenece cada semana. Sin eso no puede aplicar continuidad dentro del ciclo y rotación al cambiar de ciclo (AH2-015, AH2-016);
- cuál es el **historial efectivo**, es decir, qué horario rigió realmente cada semana. Lo necesitan la rotación, la equidad y la continuidad.

Además, el diseño tiene que funcionar para **160 sucursales** de una o más empresas, sin convertir las particularidades de la 091 en reglas universales.

## 2. Estado actual verificado (código en `905cb75`)

| Tema | Comportamiento actual | Archivo |
|---|---|---|
| Versionado | Regenerar el mismo lunes crea la versión `max + 1`. No existe un estado de flujo. | `src/hooks/useHistorial.ts` |
| «Último horario» | Se elige la semana con `generadoEl` más reciente, publicada o no. | `src/pages/UltimoHorarioPage.tsx:35` |
| Rotación | Toma las últimas 3 semanas usando la **última versión por lunes** (`ultimasVersiones`), sea borrador o no y sea pasada o futura. | `src/utils/preferencias.ts:110,144` |
| Validación | `validarResultadoSemana` devuelve VALIDADO / BORRADOR / SIN VERIFICAR. Se informa, pero **no bloquea** ningún guardado: no hay publicación. | `src/utils/validacionSemana.ts` |
| Trazabilidad | En el jsonb se guardan `perfilHorasId`, `configOperativa`, `disponibilidadSemana`, `cumplimientoHoras` y `generacion` (versión del algoritmo, estrategia, mejora, validez). **No** se guarda una huella del POM, de las reglas ni del roster. | `src/utils/almacen.ts:207` |
| Persistencia | Supabase `semanas_historial (id, lunes_fecha, version, horario_completo jsonb, metricas jsonb, sucursal_id, created_at)`, con respaldo en localStorage. Se guardan hasta 60 semanas. | `src/utils/almacen.ts` |
| Acceso | Según la migración del repo, la política de acceso exige `local_id = auth.uid()`: **cada usuario ve solo sus propias filas**. No hay pertenencia a una sucursal ni roles. | `supabase/migrations/20260713120000_capacidades_configurables.sql:57-73` |
| Sucursal activa | Se guarda en localStorage (`aliada_sucursal_actual`; por defecto 091). Las claves locales se separan por sucursal. | `src/utils/sucursal.ts` |

**INFERIDO / sin verificar:** la columna `sucursal_id` existe en la base real (el código la envía), pero la migración del repo no la crea. El esquema real de Supabase debe reverificarse en modo solo lectura antes de cualquier migración (MASTER §5).

## 3. Conceptos

| Concepto | Definición |
|---|---|
| **Empresa** | Titular de las sucursales. Define valores por defecto (reglas operativas, cobertura objetivo, calendario de ciclos, formato del PDF). |
| **Zona** (opcional) | Agrupa sucursales que comparten configuración, por ejemplo las de una región. |
| **Sucursal** | Unidad que planifica: tiene roster, POM, ciclos y publicaciones propias. |
| **Modalidad** | `semanal`: se publica cada semana. `mensual`: se publica un patrón para todo el ciclo. Se configura por sucursal (#44). |
| **Ciclo de planificación** | Período con `cicloPlanificacionId` y una fecha de inicio **declarada** (AH2-016). El fin es el inicio del ciclo siguiente. Nunca se deduce del día 1 del mes. |
| **Semana operativa** | De lunes a domingo, identificada por el lunes (`fechaLunes`). |
| **Versión** | Cada generación o edición guardada. Es inmutable una vez publicada. |
| **Publicación** | Acto humano y auditado que pone una versión en vigencia. En modalidad mensual cubre varias semanas. |
| **Vigente** | Para una sucursal y un lunes: la versión **publicada** que no fue reemplazada. Es un valor **derivado**, no se guarda. |
| **Historial efectivo** | Secuencia de semanas vigentes pasadas, una por lunes. Es la única base válida para la equidad y la continuidad. |
| **Realmente cumplido** | Asistencia efectiva. **Fuera de alcance** (#44): nunca se infiere del horario. |

Se separan dos ejes que hoy se mezclan:
- **Validez**, que calcula el validador independiente y no se guarda como verdad: VALIDADO / BORRADOR (no publicable) / SIN VERIFICAR.
- **Estado de flujo**, que registra decisiones humanas: ver §5.

## 4. Modelo de datos (TypeScript, PROPUESTO)

```ts
// Configuración por sucursal, con herencia empresa → zona → sucursal.
interface ConfigPlanificacion {
  sucursalId: string
  modalidad: 'semanal' | 'mensual'
  coberturaObjetivoPct: number          // 091: 95 (AH2-017)
  zonaHoraria: string                   // p. ej. 'America/Argentina/Buenos_Aires'; define «pasado» (I4)
  flujoPublicacionActivo: boolean       // habilita el flujo por sucursal (despliegue gradual)
}

// AH2-016: el corte es explícito. Fin = inicio del ciclo siguiente.
interface CicloPlanificacion {
  id: string                            // cicloPlanificacionId
  sucursalId: string
  inicio: string                        // YYYY-MM-DD; propuesto: debe ser lunes (decisión D2)
  nombre: string                        // p. ej. 'Diciembre 2026'
  origen: 'sucursal' | 'calendario-empresa'
  creadoPor: string; creadoEn: string   // auditoría
  anuladoEn?: string                    // solo si no tiene publicaciones; nunca se borra
}

type EstadoFlujo = 'BORRADOR' | 'APROBADO' | 'PUBLICADO' | 'REEMPLAZADO' | 'DESCARTADO'

interface EventoFlujo {
  de: EstadoFlujo | null; a: EstadoFlujo
  por: string                           // id de usuario; nunca un agente (I8)
  rol: Rol; en: string                  // ISO
  motivo?: string                       // obligatorio al reemplazar, descartar o aprobar con excepción
  validacion: 'VALIDADO' | 'BORRADOR' | 'SIN VERIFICAR'   // resultado del validador en ese momento
}

// Extensión de SemanaHistorial en el jsonb horario_completo (sin migración en B1-B3).
interface FlujoSemana {
  estado: EstadoFlujo
  cicloPlanificacionId: string | null   // null = semana legada (§7.3)
  publicacionId?: string                // agrupa las semanas de una publicación mensual
  vigenteDesde?: string; vigenteHasta?: string   // fechas incluidas; se fijan al publicar
  reemplazaA?: string; reemplazadaPor?: string   // ids de versión
  huellas: {                            // reproducibilidad (MASTER §3, #12)
    pom: string                         // SHA-256 de la matriz normalizada 7×31
    reglas: string; roster: string; configOperativa: string
    perfilHorasId: string; versionAlgoritmo: string       // ya persistidos en tramo A
  }
  eventos: EventoFlujo[]                // solo se agregan, nunca se editan
}

// Modalidad mensual: una publicación cubre todas las semanas del ciclo (4 o 5).
interface Publicacion {
  id: string; sucursalId: string; cicloPlanificacionId: string
  modalidad: 'semanal' | 'mensual'
  semanas: Array<{ fechaLunes: string; versionId: string }>
  publicadaPor: string; publicadaEn: string
}

type Rol = 'supervisor' | 'aprobador' | 'admin-sucursal' | 'admin-empresa' | 'auditor'
```

**Módulo de dominio propuesto:** `src/planificacion/` (nuevo). Contiene solo funciones puras, sin I/O:
- `resolverCiclo(ciclos, fechaLunes)`;
- `esPrimeraSemanaDelCiclo(...)`;
- `resolverVigente(versiones, sucursal, fechaLunes)`;
- `historialEfectivo(versiones, hasta)`;
- `transicionar(flujo, accion, actor, validacion)`, que devuelve el flujo nuevo o un error tipado;
- `diffHorarios(vigente, propuesta)`;
- `huella(...)`.

Así la lógica se prueba sin Supabase y sirve tanto al almacenamiento actual como a uno futuro.

## 5. Máquina de estados

```text
                 editar / regenerar (versión nueva)
                 ┌───────────────────────┐
                 ▼                       │
  [generar] → BORRADOR ──aprobar──► APROBADO ──publicar──► PUBLICADO ──(otra versión se publica)──► REEMPLAZADO
                 │                       │
                 └──descartar──► DESCARTADO ◄──descartar──┘
```

| Transición | Quién | Precondiciones |
|---|---|---|
| generar → BORRADOR | supervisor | Ninguna: guardar un borrador con advertencias está permitido (AH2-008). |
| BORRADOR → APROBADO | aprobador (propuesto: puede ser el mismo supervisor si la sucursal lo configura; decisión D3) | Validador en **VALIDADO**: 0 violaciones y sin limitaciones (por ejemplo, perfil de horas reconocido y fichas PART válidas). La versión está asignada a un ciclo. |
| APROBADO → PUBLICADO | aprobador | Revalidar en el momento de publicar (reglas y roster pudieron cambiar). La huella del POM coincide. No hay otra publicación concurrente para esa sucursal y semanas (control optimista por versión). Las semanas que cubre no empezaron, salvo replanificación parcial (tramo D). |
| PUBLICADO → REEMPLAZADO | automático, al publicar otra versión que la reemplaza | Motivo obligatorio. La versión anterior queda inmutable. |
| BORRADOR / APROBADO → DESCARTADO | supervisor / aprobador | Motivo opcional. |
| Editar un APROBADO | — | Genera una versión nueva en BORRADOR. Un aprobado no se edita en el lugar. |
| Editar un PUBLICADO | — | **Prohibido.** Genera una versión nueva (reemplazo) que debe recorrer el flujo completo. |

**VALIDADO no es un estado de flujo.** Es el resultado del validador y se registra en cada `EventoFlujo`. #12 proponía `BORRADOR → VALIDADO → APROBADO → PUBLICADO`; esta propuesta lo reemplaza por la separación entre validez y flujo (decisión D1).

## 6. Invariantes

| ID | Invariante | Cómo se garantiza |
|---|---|---|
| I1 | Para cada (sucursal, lunes) hay **como máximo una** versión vigente. | `resolverVigente` y control optimista al publicar. Prueba de propiedad con publicaciones repetidas. |
| I2 | Solo se publica lo que el validador declara **VALIDADO** y un humano aprobó. | `transicionar` exige ambas cosas. La UI no ofrece «Publicar de todos modos». |
| I3 | Una versión publicada es inmutable. | Cualquier cambio crea una versión nueva y se marca `reemplazadaPor`. |
| I4 | Lo transcurrido no se reescribe. Las fechas anteriores a hoy, en la zona horaria de la sucursal, no cambian. | `publicar` rechaza cubrir días pasados. El tramo D define la replanificación parcial desde una fecha. |
| I5 | La equidad, la rotación y la continuidad se calculan **solo** sobre el historial efectivo: una semana vigente por lunes, nunca borradores, versiones repetidas ni semanas futuras. | `historialEfectivo`. Reemplaza el uso de `ultimasVersiones` en la rotación. |
| I6 | El cambio de ciclo es explícito (AH2-016). | `resolverCiclo` usa solo `CicloPlanificacion.inicio`. Prueba: una semana que cruza el fin de mes sin un ciclo nuevo **no** dispara la rotación (#44 (e)). |
| I7 | Aislamiento por sucursal: todo registro tiene `sucursalId` y toda consulta filtra por él. | Hoy se cumple solo con claves locales y la columna `sucursal_id`. A escala hace falta el modelo de acceso de AH2-022. |
| I8 | Ningún agente aprueba ni publica (MASTER §6.1, punto 6). | `EventoFlujo.por` debe ser un usuario humano con rol. |
| I9 | Reproducibilidad. | `huellas` y `generacion.versionAlgoritmo`. Una versión publicada guarda todo lo necesario para revalidarla. |
| I10 | El PDF muestra el estado real. | Encabezado «BORRADOR (no oficial)» o «PUBLICADO vN · aprobado por … el …». Un borrador nunca sale como oficial (#12). |
| I11 | Las reglas obligatorias prevalecen sobre la continuidad y la rotación (AH2-012, §6.1). | La continuidad y la rotación son objetivos del tramo C, subordinados al validador. |

## 7. Vigencia, ciclo y continuidad semanal

### 7.1 Resolución de ciclo y vigencia

```text
resolverCiclo(ciclos, L) = ciclo con mayor inicio ≤ L (sin anular)       → null si no hay ciclos (legado)
esPrimeraSemanaDelCiclo(L) = resolverCiclo(L).id ≠ resolverCiclo(L − 7 días).id
resolverVigente(L) = versión con estado PUBLICADO cuya [vigenteDesde, vigenteHasta] contiene L
historialEfectivo(hasta) = [resolverVigente(L) para cada lunes L < hasta] sin huecos inventados
```

### 7.2 Modalidades

- **Semanal:** cada semana se publica por separado (`Publicacion.semanas` tiene 1 elemento). La semana siguiente se genera con el contexto de continuidad del §7.4.
- **Mensual:** al publicar el ciclo se fija el patrón para **todas** sus semanas reales: 4 o 5, según el próximo `inicio`. Se materializa una versión por lunes (aplicando las excepciones con vigencia de cada semana) y todas comparten `publicacionId`.
  - Una revisión extraordinaria por contingencia reemplaza solo las semanas futuras afectadas (tramo D).
  - Un POM nuevo cargado dentro de un ciclo mensual se **compara** con el anterior (tramo C), pero **no cambia** el horario publicado por sí solo (#44).

### 7.3 Semanas legadas (anteriores al tramo B)

Las semanas guardadas sin `flujo` no tienen estado ni ciclo. Propuesta (decisión D4):
- **No** se reinterpretan como PUBLICADAS.
- Para la rotación se usa, de forma **transitoria**, la última versión por lunes marcada como «legado (presunto vigente)». Es lo mismo que se hace hoy, así que no hay regresión.
- Esto termina cuando existen 4 semanas publicadas con el flujo nuevo.
- La UI la muestra como «Historial anterior al flujo de publicación».

### 7.4 Contrato con el tramo C (continuidad y rotación)

El tramo B **no cambia el motor**. Solo produce el contexto que consumirá el tramo C:

```ts
interface ContextoContinuidad {
  ciclo: CicloPlanificacion | null
  primeraSemanaDelCiclo: boolean        // true → priorizar rotación; false → estabilidad fuerte (#44)
  vigenteAnterior: SemanaHistorial | null   // semana publicada previa: referencia de estabilidad
  historialEfectivo: SemanaHistorial[]  // para la equidad (mañanas, tardes, cierres, fines de semana)
}
```

También incorpora `diffHorarios(vigenteAnterior, propuesta)`, informativo para la pantalla de aprobación:
- personas afectadas;
- cambios de franco;
- cambios de tipo de turno (mañana / tarde / cierre);
- desvío de horario en minutos (un ajuste de 30 min se distingue de un cambio de turno).

Así se cumple el flujo de #44: «X personas cambian de turno respecto del período anterior». Los pesos y la optimización de estabilidad son del tramo C.

## 8. Experiencia del supervisor (AH2-008)

El recorrido normal **no se alarga**:
1. Subir el POM.
2. Generar y revisar. La pantalla agrega: ciclo vigente, «primera semana del ciclo», el diff frente a la semana vigente y el estado de validez.
3. **Aprobar y publicar** con un solo botón cuando aprobador y supervisor son la misma persona (si la sucursal lo permite, D3), o **Enviar a aprobación**. Luego exportar el PDF oficial.

La configuración de modalidad, ciclos, roles y cobertura objetivo es poco frecuente y la administran roles autorizados. Se puede proponer un **calendario de ciclos de la empresa** que cada sucursal confirma o ajusta. Nunca se pide la configuración en cada carga de POM.

## 9. Arquitectura para 160 sucursales

### 9.1 Jerarquía y herencia de configuración

```text
Empresa ──► Zona (opcional) ──► Sucursal
  valores por defecto     sobrescritura        sobrescritura final
```

- **Se heredan:** modalidad, cobertura objetivo, reglas operativas de nivel empresa (AH2-010), calendario de ciclos, formato del PDF y zona horaria.
- **Son siempre de la sucursal:** roster, POM, publicaciones y excepciones.
- Cada valor efectivo se resuelve con su **origen** (empresa, zona o sucursal) y se muestra en la UI, igual que hoy la «regla efectiva» de #38.
- No hay constantes de la 091 en el código: 95 %, 32 h y apertura solo AUX llegan siempre desde la configuración o el perfil.

### 9.2 Acceso y roles: dependencia AH2-022, bloqueante a escala

El modelo actual de acceso por usuario (`local_id = auth.uid()`) **no alcanza** para:
- que varias personas trabajen sobre la misma sucursal;
- que el aprobador sea distinto del supervisor;
- la auditoría de empresa.

Se requiere, con diseño y autorización propios (fuera de este tramo):
- `membresias(usuario_id, empresa_id, sucursal_id | zona_id | null, rol)`;
- políticas de acceso por pertenencia;
- separación del proyecto Supabase compartido con Prestify (MASTER §5).

**Mientras tanto,** B1–B3 funcionan con el modelo actual: una persona por sucursal, que puede aprobar si la sucursal lo habilita. La identidad del aprobador queda auditada.

### 9.3 Volumen y rendimiento (estimación)

- **Filas:** 160 sucursales × 52 semanas × ~3 versiones ≈ **25 000 filas por año**.
- **Tamaño:** con jsonb de unos 50–150 KB por fila (cajeros más disponibilidad, cumplimiento y métricas), entre **1,2 y 3,7 GB por año**. Es manejable, pero exige:
  - columnas indexadas para `sucursal_id`, `lunes_fecha`, `estado` y `ciclo_id` (B4, con migración autorizada);
  - no traer el jsonb completo para listar historiales;
  - archivar las versiones descartadas pasado un período (decisión D6).
- **Límite local de 60 semanas por sucursal:** suficiente para equidad y continuidad (necesitan menos de 3 ciclos), pero el historial efectivo de largo plazo debe venir del servidor.
- **Cálculo:** cada sucursal genera en el navegador, así que no hay costo de servidor por sucursal. Para sucursales con 20 o más cajeros es requisito previo el **Web Worker** (`docs/proposals/AH2-020_WEB_WORKER_GENERACION.md`): con 35–55 cajeros en equipos lentos la interfaz se congela 14–21 s.
- **Concurrencia:** publicar usa control optimista (`version` esperada). Si alguien publicó antes, la operación falla con un aviso y no pisa la publicación ajena.

### 9.4 Despliegue gradual

- `flujoPublicacionActivo` por sucursal: la 091 primero; después olas por zona.
- Las sucursales sin el flujo activo siguen como hoy, sin regresión.
- Métricas por sucursal para decidir cada ola:
  - semanas publicadas en término;
  - porcentaje publicado como VALIDADO (debe ser 100 %);
  - reemplazos por semana;
  - cobertura frente al objetivo;
  - tiempo de generación.
- Configuración validada al cargar: modalidad sin ciclos, ciclos superpuestos o un inicio que no es lunes generan un aviso bloqueante para publicar.

## 10. Transición sin ruptura (plan de PR)

| Sub-tramo | Contenido | Migración | Riesgo |
|---|---|---|---|
| **B1** | Módulo `src/planificacion/` puro: ciclos, vigencia, historial efectivo, máquina de estados, diff y huellas. Pruebas unitarias y de propiedad. **Sin cambios de UI ni de comportamiento.** | No | Muy bajo |
| **B2** | Flujo en la UI detrás de `flujoPublicacionActivo` (apagado por defecto): aprobar y publicar, estado en Último Horario y en el PDF, y bloqueo de publicación sin VALIDADO. `flujo` viaja en el jsonb existente. | No | Bajo |
| **B3** | Rotación y «último horario» basados en el historial efectivo y la vigencia (I5). Semanas legadas según D4. Configuración de ciclos por sucursal, guardada en el almacén de reglas o configuración existente (a definir en B1, sin migración). | No | Medio: cambia el sesgo de rotación de las sucursales con el flujo activo. |
| **B4** | Columnas indexadas y membresías o roles (AH2-022): SQL propuesto con reversión, **sin aplicar sin autorización**. | **Sí** (autorización explícita) | Alto: proyecto compartido con Prestify. |

Cada sub-tramo se entrega como un PR aislado, con pruebas, CURRENT_WORK y evidencia, sin merge ni deploy sin autorización.

## 11. Dependencias

| Dependencia | Tipo | Bloquea |
|---|---|---|
| AH2-022: membresías, roles y acceso por sucursal | Diseño y migración autorizada | B4 y aprobación con varios usuarios a escala. B1–B3 no. |
| Web Worker de generación (propuesta AH2-020) | PR separado | Activar el flujo en sucursales con 20 o más cajeros. |
| Tramo C: continuidad y rotación en el motor; comparación de POM; benchmark #13 | Tramo siguiente | El uso de `ContextoContinuidad` en la optimización. B entrega el contrato. |
| Tramo D: ausencias y replanificación parcial (#28) | Tramo posterior | Reemplazos que empiezan a mitad de semana (I4). |
| #12: PDF con versión y aprobación | Integrado en B2 | — |
| Reverificación de solo lectura del esquema Supabase real (MASTER §5) | Verificación | B4. |
| Validación jurídica de 32 h y de los perfiles (AH2-004) | Decisión legal | La política de publicar como «oficial» (D5). |

## 12. Criterios de aceptación

**B1 — dominio (pruebas unitarias, datos sintéticos):**
1. Ciclo de 4 semanas y ciclo de 5 semanas: `resolverCiclo` y `esPrimeraSemanaDelCiclo` son correctos en cada lunes. Una publicación mensual cubre exactamente 4 o 5 semanas.
2. Una semana que cruza fin de mes sin ciclo nuevo da `primeraSemanaDelCiclo = false` (#44 (e)). Con un ciclo nuevo declarado, `true` (#44 (b)).
3. Tres versiones de un mismo lunes (una publicada, una reemplazada y un borrador): `resolverVigente` devuelve solo la publicada vigente (I1). `historialEfectivo` cuenta una semana por lunes, sin borradores ni semanas futuras (I5, #44 (g)).
4. `transicionar`:
   - rechaza publicar sin VALIDADO, con limitaciones o sin aprobación (I2);
   - rechaza editar un publicado (I3);
   - rechaza cubrir días pasados (I4);
   - rechaza un actor que no es humano (I8).

   Cada rechazo devuelve un error tipado y legible.
5. `huella` es estable ante el orden de claves y cambia ante cualquier cambio de celda del POM, de regla o de roster (I9).
6. `diffHorarios` distingue un ajuste de 30 min de un cambio de turno y cuenta francos movidos y personas afectadas.
7. Prueba de propiedad: con N publicaciones y reemplazos aleatorios, ningún lunes tiene más de una vigente.

**B2 — UI y flujo (Playwright, Supabase interceptado):**
1. Con el flujo apagado, el comportamiento es idéntico al actual: las 11 pruebas E2E existentes pasan sin cambios.
2. Con el flujo encendido:
   - un horario BORRADOR no se puede publicar y la UI explica por qué;
   - uno VALIDADO se aprueba y se publica;
   - el PDF muestra «PUBLICADO vN · aprobado por … el …»;
   - el PDF de un borrador muestra «BORRADOR (no oficial)».
3. Regenerar una semana publicada crea un BORRADOR nuevo. Al publicarlo, la anterior pasa a REEMPLAZADO con motivo, y ambas quedan consultables.
4. Recargar conserva el estado y los eventos (ida y vuelta por la fila de Supabase y por localStorage).

**B3 — vigencia aplicada:**
1. «Último horario» muestra la semana **vigente**, o la del período siguiente si ya está publicada; el borrador más reciente aparece por separado como tal.
2. La rotación usa el historial efectivo. Una prueba demuestra que versiones repetidas o borradores no alteran el sesgo.
3. Semanas legadas: sin regresión frente al comportamiento actual (D4).

**Escala (B1–B3, simulación sintética):**
1. Simulación de 160 sucursales × 6 ciclos con configuración heredada (empresa → zona → sucursal):
   - cero cruces de datos entre sucursales;
   - cada valor efectivo informa su origen;
   - el tiempo de resolución de vigencia e historial es despreciable (< 50 ms por sucursal).
2. Sin datos personales en fixtures, logs ni PR.

**Transversales:**
- `tsc`, Vitest, build y Playwright en verde.
- Benchmark de 200 escenarios **idéntico** (el tramo B no toca el motor).
- Sin migraciones, Supabase, Prestify ni deploy en B1–B3.

## 13. Decisiones pendientes del propietario

| ID | Pregunta | Propuesta |
|---|---|---|
| D1 | ¿Se reemplaza el «VALIDADO como estado» de #12 por la separación validez / flujo? | Sí, como en el §5. |
| D2 | ¿El inicio de un ciclo debe caer en lunes? | Sí. Las semanas operativas van de lunes a domingo; un inicio a mitad de semana obliga a partir semanas. |
| D3 | ¿Puede el mismo supervisor aprobar y publicar? | Configurable por sucursal. En la 091, sí durante B2 (una sola persona), siempre auditado. |
| D4 | Tratamiento de las semanas legadas. | Presuntas vigentes, solo para la rotación y de forma transitoria (§7.3). Nunca se muestran como PUBLICADAS. |
| D5 | ¿Se puede publicar como «oficial» mientras la validación jurídica de 32 h esté pendiente? | Sí, con la leyenda «perfil de horas: requisito de producto; validación jurídica pendiente». Decide el propietario. |
| D6 | Retención de versiones descartadas. | Conservar 12 meses y después archivar; nunca borrar las publicadas. |
| D7 | Calendario de ciclos: ¿lo propone la empresa y lo confirma cada sucursal? | Sí. El ciclo siempre queda explícito por sucursal (AH2-016). |
| D8 | Alcance de las 160 sucursales: ¿una o varias empresas? ¿Hay zonas? | Diseño preparado para varias empresas con zonas opcionales. Confirmar contra el «prompt anterior» (ver la nota inicial). |

## 14. Riesgos

- **Acceso por usuario a escala:** sin AH2-022, el flujo con aprobador distinto del supervisor no se puede habilitar en varias sucursales.
- **Proyecto Supabase compartido con Prestify:** cualquier migración (B4) requiere coordinar con ese producto, preparar la reversión y tener autorización.
- **Cambio de sesgo de rotación (B3):** pasar de «últimas versiones» al historial efectivo cambia propuestas en las sucursales con el flujo activo. Se mitiga con despliegue por sucursal y comparación antes / después.
- **Equipos lentos:** el bloqueo de la interfaz en sucursales grandes condiciona el despliegue (Web Worker).
- **Configuración inconsistente** (ciclos superpuestos, falta de zona horaria): se valida y bloquea la publicación, nunca se corrige en silencio.
