# ALIADA HORARIOS 2.0 — TRAMO B: arquitectura de planificación por ciclos para 160 sucursales

**Estado:** PROPUESTO. Documento de investigación y diseño, **sin implementación**.
- No incluye migraciones ni escrituras en Supabase o en datos operativos.
- No cambia el motor publicado ni toca Prestify.
- No incorpora servicios pagos.

**Versión:** 2 (15/11/2026). Reemplaza la versión 1 del PR #46 e incorpora el pedido completo del propietario («DISEÑO DEL TRAMO B»).
**Base:** `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. En producción: deploy Netlify `6af8ee2d`, PR #45 integrado (contrato PART y motor «B conjunta»).
**Autoridad:** `docs/ALIADA_HORARIOS_MASTER.md`.
- En este documento, **REQUISITO** indica algo pedido o aprobado por el propietario.
- **PROPUESTO** indica diseño técnico pendiente de aprobación.
- Si algo contradice el MASTER, prevalece el MASTER.

**Issues:** #44 (arquitectura adaptativa), #12 (publicación), #10 (validador), #11 (reglas v2), #9 (IDs estables), #28 (disponibilidad), #13 (benchmark) y #14 (agente). Decisiones: AH2-015…AH2-017, AH2-020, AH2-022 y AH2-023…AH2-028.

---

## 0. Resumen ejecutivo: una sola arquitectura, no funcionalidades sueltas

Aliada se organiza alrededor de un **ciclo de vida por sucursal** que se repite en cada período. Cada vuelta deja experiencia registrada en la propia sucursal:

```text
          ┌─────────────────────────── MEMORIA DE LA SUCURSAL ◄──────────────────────────┐
          │      (preferencias confirmadas, parámetros, resultados de cada ciclo)        │
          ▼                                                                               │
 FUENTE DE DEMANDA ──► PLANIFICACIÓN ──► VALIDACIÓN ──► APROBACIÓN ──► PUBLICACIÓN ──► EJECUCIÓN
 (POM PDF hoy; API     motor central     validador      humana         vigencia        (ausencias →
  autorizada mañana)   compartido +      independiente  (roles)        única por       replanificación
                       parámetros de     (única          │              período         parcial, sin
                       la sucursal       compuerta)      │              │               tocar el pasado)
          ▲                                              │              │                     │
          └──── CONFIGURACIÓN DE LA SUCURSAL ◄───────────┴──────────────┴─────────────────────┘
                (colaboradores, contratos, reglas con vigencia, ciclos, políticas heredadas
                 empresa → región → sucursal)
```

Principios rectores:
1. **Un solo motor central y un solo validador** para todas las sucursales. Cada sucursal aporta solo **datos y parámetros** propios; no hay código ni constantes de una sucursal (la 091 incluida).
2. **El validador independiente es la única compuerta** hacia la publicación. Ni el aprendizaje, ni la continuidad, ni un agente, ni una persona pueden saltearlo.
3. **Registro de eventos que solo se agregan.** Toda decisión (generar, editar, validar, aprobar, publicar, reemplazar, registrar una ausencia, confirmar una preferencia) queda como evento con autor y fecha. Los estados «vigente», «historial efectivo» y «memoria» se **derivan** de esos eventos.
4. **Funciones puras en el núcleo.** Ciclos, vigencia, diffs, equidad, ausencias y aprendizaje son módulos TypeScript sin entrada ni salida, probables sin base de datos. Sirven igual al almacenamiento actual (jsonb) y al futuro (tablas).
5. **Costo operativo bajo.** Se usa lo que ya existe (Supabase, Netlify, cálculo en el navegador mediante un Web Worker) y no se agregan servicios pagos.

## 1. Diagnóstico de la arquitectura actual y brechas para 160 sucursales

Verificado en código y producción el 15/11/2026, salvo donde dice INFERIDO.

| # | Área | Situación actual | Brecha para 160 sucursales | Gravedad | Cierra |
|---|---|---|---|---|---|
| 1 | Identidad y acceso | La migración del repo filtra `semanas_historial`, `reglas_configurables`, `correcciones_manuales` y `aprendizajes_derivados` por usuario (`local_id = auth.uid()`). | No permite varios supervisores por sucursal, aprobador distinto del supervisor ni directores regionales. | **Bloqueante** | P1 |
| 2 | Sucursal activa | Texto libre en localStorage (`aliada_sucursal_actual`, por defecto `091`). | La sucursal debe salir de las membresías del usuario. Hoy no hay control de a qué sucursal se accede. | Alta | P1, U0 |
| 3 | Estructura organizacional | No hay empresa, región ni sucursal como entidades: `sucursal_id` es un texto. INFERIDO: la columna existe en la base real pero no en la migración del repo. | Faltan la jerarquía empresa → región → sucursal → usuarios y la herencia de configuración. | **Bloqueante** | P1 |
| 4 | Estados y publicación | Las versiones se guardan por lunes (`version`), sin estado. «Último horario» toma la más reciente generada. | Faltan BORRADOR, VALIDADO, APROBADO, PUBLICADO, vigencia única, responsables y auditoría. | Alta | B1, U1, P2 |
| 5 | Ciclos | No existen. | Faltan ciclos explícitos, semanal o mensual, con inicio y fin, y continuidad o rotación según el ciclo. | Alta | B1, U2 |
| 6 | Rotación | Usa la última versión por lunes de las 3 semanas más recientes, sean borradores o futuras (`preferencias.ts:110,144`). | Debe usar solo el historial efectivo (lo publicado y vigente). | Media | U2 |
| 7 | Continuidad | El motor no conoce el horario vigente anterior. | Falta un candidato de continuidad y la medición de cambios. | Media | C1 |
| 8 | Ausencias | Solo hay excepciones por fecha para AUX y eventuales (`disponibilidadHabitual.ts`) y reglas por persona. | Faltan un módulo unificado (FULL, PART, AUX y eventual), el estado de la ausencia y la replanificación parcial sin tocar el pasado. | Alta | B2, D1, P3 |
| 9 | Horas suplementarias PART | No existen (correcto). El tope es min(ficha, perfil). | Hace falta una capacidad separada, autorizada y auditable para el futuro. | Media | S1 |
| 10 | Aprendizaje | `correcciones_manuales` identifica por **nombre** y no guarda motivo. Los aprendizajes se derivan al vuelo (0 materializados). Solo influye como sesgo blando: es correcto. | Faltan IDs estables, motivo, clasificación recurrente o temporal, confirmación del supervisor, memoria por sucursal y registro de resultados por ciclo. | Media | B3, U3, P4 |
| 11 | Reglas | Conviven `reglas_configurables` (legado) y el modelo `src/reglas/reglasV2.ts` con su SQL propuesto (`docs/proposals/RULES01_reglas_v2.sql`, no aplicado). | Falta adoptar reglas v2 (ámbito, vigencia, nivel, auditoría) con herencia empresa → sucursal. | Media | P5 |
| 12 | Interfaz durante la generación | El cálculo bloquea la interfaz: 0,5–3 s en la 091 y hasta 21 s con 55 cajeros en equipos lentos. | Hace falta un Web Worker con cancelación. | Alta para sucursales grandes | W1 |
| 13 | Reproducibilidad | Los presupuestos son por tiempo (6 s en la pasada 1 y 20 s en el multi-arranque). | Con corte por trabajo, la misma entrada da el mismo resultado en cualquier equipo. | Media | W2 |
| 14 | Fuente de demanda | Solo el PDF de POM (31 franjas desde 07:00). | Falta abstraer la fuente: PDF, carga manual y API autorizada futura, con horario operativo por sucursal. | Media | B4 |
| 15 | Copia local | localStorage como respaldo y cola de reintentos por dispositivo. | Con varios usuarios, la copia local debe ser caché con detección de conflictos. Publicar nunca puede hacerse sin conexión. | Media | P2 |
| 16 | Auditoría | No hay registro de auditoría. | Falta un registro que solo se agrega para configuración, flujo y ausencias. | Alta | P2 |
| 17 | Proyecto compartido | Supabase compartido con Prestify (MASTER §5: tablas `al_*` y `ep_*` sin políticas de acceso; dato **no reverificado** desde el 12/11). En el sitio `al-iada` de producción están desplegadas también `create-payment` y `webhook-mp` (VERIFICADO en el deploy `6af8ee2d`). | Un SaaS comercializable necesita aislar productos (base y sitio). Este tramo no lo modifica. | **Bloqueante para comercializar** | Decisión D13 |
| 18 | Volumen | Se guardan hasta 60 semanas por sucursal y se trae el jsonb completo. | Faltan columnas indexadas y listados sin el jsonb (§10.6). | Baja | P2 |

**Qué ya sirve y se conserva:**
- motor determinístico de tres pasadas con multi-arranque y respaldo;
- validador independiente;
- contrato de horas único;
- recálculo de la cascada tras editar;
- trazabilidad `generacion` (versión del algoritmo y estrategia);
- PDF operativo;
- carga desde el PDF de POM con la semana del encabezado;
- reglas v2 diseñadas;
- aprendizaje que solo produce sesgos blandos.

## 2. Diseño técnico del Tramo B (visión de componentes)

| Componente | Responsabilidad | Módulo propuesto | Persistencia (transición → destino) |
|---|---|---|---|
| Configuración de sucursal | Colaboradores, contratos, reglas v2, ciclos, políticas (modalidad, cobertura objetivo, horas suplementarias, continuidad) con herencia | `src/configuracion/` (resolución de valores efectivos con su origen) | Almacén actual → tablas P1/P5 |
| Fuente de demanda | Convierte cualquier origen en una `MatrizDemanda` normalizada con huella | `src/demanda/` (adaptadores `pom-pdf`, `manual`, `api` futuro) | jsonb → tabla `demandas` |
| Planificación | Motor central (sin cambios en B) más parámetros de la sucursal; candidatos de continuidad y rotación en C | `src/algoritmo/` (existente) y `src/utils/generacionMultiArranque.ts` | — |
| Validación | Única compuerta; también se ejecuta en el servidor al publicar | `src/algoritmo/validadorIndependiente.ts` (existente) | — |
| Flujo de planificación | Estados, vigencia, publicación, reemplazo, diff y huellas | `src/planificacion/` (nuevo, puro) | jsonb `flujo` → tablas `versiones_horario`, `publicaciones` |
| Contingencias | Ausencias, disponibilidad efectiva y replanificación parcial | `src/contingencias/` (nuevo, puro) | → tabla `ausencias` |
| Memoria de la sucursal | Registro de cada ciclo, modificaciones con motivo, preferencias propuestas y confirmadas, parámetros | `src/memoria/` (nuevo, puro) | jsonb → tablas P4 |
| Auditoría | Eventos que solo se agregan | `src/auditoria/` | → tabla `eventos_auditoria` |
| Ejecución en segundo plano | Generación en un Web Worker, cancelable y reproducible | `src/workers/` | — |

## 3. Modelo de datos propuesto

### 3.1 Entidades y relaciones

```text
Empresa 1─* Región 1─* Sucursal 1─* Colaborador 1─* Contrato (vigencia)
   │            │          │  ├─* ReglaV2 (ámbito empresa/región/sucursal/grupo/persona, vigencia, nivel)
   │            │          │  ├─* CicloPlanificacion
   │            │          │  ├─* Demanda (snapshot inmutable) ──┐
   │            │          │  ├─* VersionHorario ◄───────────────┘ (huella de la demanda)
   │            │          │  │       └─* EventoFlujo (inmutable)
   │            │          │  ├─* Publicacion 1─* (fechaLunes → VersionHorario)
   │            │          │  ├─* Ausencia
   │            │          │  ├─* AutorizacionHorasSuplementarias
   │            │          │  ├─* RegistroCiclo (resultados) ─* Modificacion (motivo, clasificación)
   │            │          │  └─* PreferenciaSucursal (propuesta / confirmada / retirada)
Usuario *─* Membresia (ámbito empresa | región | sucursal, rol)
EventoAuditoria (empresa, sucursal?, actor, entidad, acción, antes/después, fecha)
```

### 3.2 Tipos principales (TypeScript, PROPUESTO)

```ts
type Id = string // UUID; los colaboradores usan id estable (ID-01, #9), nunca el nombre

interface Empresa { id: Id; nombre: string; zonaHorariaPorDefecto: string }
interface Region { id: Id; empresaId: Id; nombre: string }
interface Sucursal { id: Id; empresaId: Id; regionId: Id | null; codigo: string /* '091' */; nombre: string; zonaHoraria: string }

type Rol = 'admin-empresa' | 'director-regional' | 'supervisor' | 'aprobador' | 'auditor'
interface Membresia { usuarioId: Id; rol: Rol; ambito: { tipo: 'empresa' | 'region' | 'sucursal'; id: Id }; desde: string; hasta?: string }

// Políticas con herencia empresa → región → sucursal. Cada valor efectivo informa su origen.
interface PoliticasPlanificacion {
  modalidad: 'semanal' | 'mensual'
  coberturaObjetivoPct: number                   // AH2-017 (091: 95)
  horarioOperativo: { desde: string; hasta: string } // independiente de la grilla del POM
  aprobacionPropiaPermitida: boolean             // D3
  horasSuplementarias: { habilitada: boolean }   // AH2-024; por defecto false
  continuidad: { toleranciaCoberturaPp: number } // D9; se calibra con benchmark (tramo C)
}
interface ValorEfectivo<T> { valor: T; origen: 'empresa' | 'region' | 'sucursal' }

// REQUISITO: ciclo explícito con identificador, inicio y fin (AH2-016).
interface CicloPlanificacion {
  id: Id; sucursalId: Id; nombre: string
  modalidad: 'semanal' | 'mensual'
  inicio: string; fin: string          // inicio = lunes y fin = domingo (D2); 1 semana o 4–5 semanas
  estado: 'planificado' | 'abierto' | 'cerrado'
  origen: 'sucursal' | 'calendario-empresa'
  auditoria: { creadoPor: Id; creadoEn: string }
}

// Fuente de demanda independiente de POM.
interface MatrizDemanda {
  sucursalId: Id; fechaLunes: string
  franjaMin: 30; desde: string; hasta: string    // horario operativo de la sucursal
  valores: number[][]                            // [día 0..6][franja]: cajas simultáneas
  fuente: { tipo: 'pom-pdf' | 'manual' | 'api'; proveedor?: string; referencia?: string; importadoPor: Id; importadoEn: string }
  huella: string                                 // SHA-256 de la matriz normalizada
}

type EstadoVersion = 'BORRADOR' | 'VALIDADO' | 'APROBADO' | 'PUBLICADO' | 'REEMPLAZADO' | 'DESCARTADO'
interface VersionHorario {
  id: Id; sucursalId: Id; cicloId: Id; fechaLunes: string; numero: number
  estado: EstadoVersion
  origen: 'generacion' | 'edicion' | 'replanificacion' | 'continuidad'
  basadaEn?: Id                         // versión de la que deriva (edición o replanificación)
  horario: unknown                      // ResultadoAsignacion actual
  generacion: RegistroGeneracion        // ya existe (versión del algoritmo, estrategia, mejora, validez)
  huellas: { demanda: string; reglas: string; roster: string; contratos: string; configOperativa: string; ausencias: string; perfilHorasId: string }
  validacion?: { estado: 'VALIDADO' | 'BORRADOR' | 'SIN VERIFICAR'; huellaValidada: string; en: string; validadorVersion: string }
  vigencia?: { desde: string; hasta: string }   // se fija al publicar
  reemplazaA?: Id; reemplazadaPor?: Id
}
interface EventoFlujo { versionId: Id; de: EstadoVersion | null; a: EstadoVersion; actorId: Id; rol: Rol; en: string; motivo?: string; resumenValidacion: string }

interface Publicacion { id: Id; sucursalId: Id; cicloId: Id; semanas: Array<{ fechaLunes: string; versionId: Id }>; publicadaPor: Id; publicadaEn: string }

// Contingencias (§7). Sin diagnósticos médicos.
interface Ausencia {
  id: Id; sucursalId: Id; colaboradorId: Id
  tipo: 'vacaciones' | 'licencia' | 'accidente' | 'indisponibilidad' | 'otra'
  desde: string; hasta: string | null; alcance: 'dia-completo' | { desde: string; hasta: string }
  estado: 'registrada' | 'confirmada' | 'anulada'
  registradaPor: Id; registradaEn: string; observacionAdministrativa?: string
}

// Horas suplementarias PART (§8): capacidad separada, apagada por defecto.
interface AutorizacionHorasSuplementarias {
  id: Id; sucursalId: Id; colaboradorId: Id
  desde: string; hasta: string; horasAdicionalesMaxSemana: number
  motivo: { tipo: 'ausencia-prolongada' | 'contingencia' | 'otro'; ausenciaId?: Id; detalle: string }
  validacionNormativa: { estado: 'pendiente' | 'validada' | 'rechazada'; fuente?: string; porId?: Id; en?: string }
  solicitadaPor: Id; autorizadaPor?: Id; estado: 'solicitada' | 'autorizada' | 'revocada' | 'vencida'
}

// Memoria de la sucursal (§9)
interface Modificacion {
  id: Id; versionId: Id; colaboradorId: Id; dia: number; antes: unknown; despues: unknown
  motivo: { codigo: CodigoMotivo; detalle?: string }  // catálogo editable (D11)
  clasificacion: 'preferencia-recurrente' | 'excepcion-temporal' | 'correccion-operativa' | 'contingencia'
  autorId: Id; en: string
}
interface RegistroCiclo {
  sucursalId: Id; cicloId: Id; publicacionIds: Id[]
  generadoInicial: { versionId: Id; estrategia: string; cobertura: number }
  aprobadoFinal: { versionId: Id; cobertura: number; faltantesH: number; sobrantesH: number }
  modificaciones: number; cambiosFrenteAlVigenteAnterior: number
  equidad: Record<Id, { mananas: number; tardes: number; cierres: number; findesTrabajados: number; francosFinde: number; semanasEfectivas: number }>
  horasSuplementariasUsadas: number
}
interface PreferenciaSucursal {
  id: Id; sucursalId: Id; colaboradorId: Id
  tipo: 'prefiere-manana' | 'prefiere-tarde' | 'evita-cierre' | 'franco-preferido' | 'hora-entrada' | 'peso-franja'
  parametros: Record<string, unknown>
  evidencia: { modificacionIds: Id[]; ciclos: number }
  estado: 'propuesta' | 'confirmada' | 'retirada' | 'vencida'
  confirmadaPor?: Id; venceEn?: string
  nivel: 'PREFERENCIA'                  // invariante: nunca NORMATIVA ni OPERATIVA
}
```

### 3.3 Persistencia: transición sin ruptura

- **Etapa 1 (sin migración, solo en la 091):**
  - `flujo`, `cicloId`, `huellas`, `vigencia` y `eventos` viajan en el jsonb `horario_completo` existente.
  - Ciclos y políticas de la sucursal se guardan en el almacén de configuración actual.
  - Modificaciones con motivo: en el jsonb de `correcciones_manuales` (campo adicional).
- **Etapa 2 (con migración autorizada):** tablas `empresas`, `regiones`, `sucursales`, `membresias`, `versiones_horario` (con columnas indexadas `sucursal_id`, `ciclo_id`, `fecha_lunes`, `estado` y el jsonb), `publicaciones`, `eventos_auditoria`, `ausencias`, `autorizaciones_horas_suplementarias`, `registros_ciclo`, `modificaciones`, `preferencias_sucursal` y `reglas_v2` (ya propuesta).
  - La migración copia en forma **idempotente** desde `semanas_historial` y no la borra (convivencia y reversión).
  - SQL propuesto en un PR propio, **no aplicado**.

## 4. Ciclos: planificación semanal o mensual

- **REQUISITO.** La modalidad se configura por sucursal (heredable). Los ciclos son explícitos, con identificador, inicio y fin. Los ciclos mensuales tienen 4 o 5 semanas según su vigencia real. La rotación es equitativa entre ciclos y el horario es estable dentro de cada ciclo.
- **Validación de la configuración (PROPUESTO):**
  - el inicio cae en lunes y el fin en domingo (D2);
  - un ciclo mensual dura 4 o 5 semanas y uno semanal, 1;
  - no hay superposiciones;
  - no hay huecos a partir del primer ciclo activo;
  - un ciclo con publicaciones no se borra: se cierra.

  Si la configuración es inválida, se bloquea la publicación con un mensaje claro, sin corregir nada en silencio.
- **Calendario de empresa (D7):** la empresa puede proponer el calendario anual de ciclos. Cada sucursal lo confirma o ajusta, y el ciclo queda siempre explícito por sucursal (AH2-016).
- **Funciones puras (`src/planificacion/ciclos.ts`):**
  - `cicloDe(ciclos, fechaLunes)`;
  - `esPrimeraSemanaDelCiclo(ciclos, fechaLunes)`;
  - `semanasDelCiclo(ciclo)`, que devuelve 4 o 5 lunes;
  - `validarCalendario(ciclos)`.
- **Mensual:** al publicar el ciclo, el patrón se materializa en **una versión por semana real**, aplicando las excepciones y ausencias de cada semana. Todas comparten la misma `Publicacion`. Un POM nuevo dentro del ciclo se **compara** con el anterior (tramo C), pero no cambia lo publicado salvo una replanificación aprobada.

## 5. Flujo de aprobación, publicación y versionado

### 5.1 Estados (REQUISITO: BORRADOR, VALIDADO, APROBADO, PUBLICADO)

```text
generar/editar/replanificar
        │
        ▼
    BORRADOR ──validar (0 violaciones, sin limitaciones)──► VALIDADO ──aprobar──► APROBADO ──publicar──► PUBLICADO
        ▲                                                      │                    │                      │
        └──────── cualquier cambio de horario o de sus huellas ┴────────────────────┘                      │
                  (edición, regla, roster, contrato, ausencia, demanda) → «validación caducada»             │
                                                                                                           ▼
    DESCARTADO ◄── descartar (BORRADOR / VALIDADO / APROBADO)               otra versión publicada ──► REEMPLAZADO
```

- **VALIDADO** es un estado del flujo, como pidió el propietario, pero **ligado a una huella**: `validacion.huellaValidada` cubre el horario y todas sus entradas. Si cambia cualquier entrada, la validación **caduca** y la versión vuelve a BORRADOR. Así se evita aprobar algo validado contra reglas viejas.
- **Publicar revalida** en el momento con el mismo validador y exige que la huella coincida.
- **REEMPLAZADO** y **DESCARTADO** son estados históricos: la versión se conserva para auditoría y comparación y no se borra nunca.

### 5.2 Permisos por transición

| Transición | Roles | Precondiciones |
|---|---|---|
| Generar o editar → BORRADOR | supervisor | Ninguna (AH2-008: se permite guardar con advertencias). |
| BORRADOR → VALIDADO | automático (el sistema ejecuta el validador) | 0 violaciones y sin limitaciones (por ejemplo, un perfil de horas desconocido o una ficha PART inválida impiden VALIDADO). |
| VALIDADO → APROBADO | aprobador; el supervisor solo si `aprobacionPropiaPermitida` (D3) | La validación sigue vigente (huella). La versión pertenece a un ciclo válido. |
| APROBADO → PUBLICADO | aprobador, o director regional o admin de empresa | Revalidación en el servidor (§10.4). Huellas iguales. Control optimista: ninguna otra versión se publicó para el mismo período después de la última lectura. No cubre días ya transcurridos (I4). |
| PUBLICADO → REEMPLAZADO | automático al publicar el reemplazo | Motivo obligatorio. Solo se reemplaza **desde una fecha** (replanificación parcial) o el período completo si todavía no empezó. |
| → DESCARTADO | supervisor o aprobador | Motivo opcional. |
| Editar un PUBLICADO | — | **Prohibido.** Genera una versión nueva con `basadaEn`, que recorre el flujo completo. |
| Cualquier transición por un agente | — | **Prohibido** (MASTER §6.1, punto 6). `actorId` debe ser una persona con membresía. |

### 5.3 Invariantes

| ID | Invariante |
|---|---|
| I1 | **Un solo horario publicado y vigente** por sucursal y día. En el dominio: `resolverVigente`. En la base (etapa 2): índice único parcial `(sucursal_id, fecha_lunes) WHERE estado = 'PUBLICADO'`, más publicación transaccional mediante RPC. |
| I2 | Solo se publica lo VALIDADO (huella vigente) y aprobado por una persona con rol. |
| I3 | Lo publicado es inmutable; las versiones anteriores se conservan siempre. |
| I4 | Ninguna jornada ya transcurrida (anterior a hoy en la zona horaria de la sucursal) cambia nunca. |
| I5 | La equidad, la continuidad y el aprendizaje usan **solo** el historial efectivo: lo publicado y vigente, una semana por lunes, sin borradores, versiones repetidas ni semanas futuras. |
| I6 | El cambio de ciclo solo surge de `CicloPlanificacion`, nunca del calendario. |
| I7 | Todo registro tiene `empresaId` y `sucursalId`; toda lectura y escritura pasa por las políticas de acceso de membresía (§10). |
| I8 | Ningún agente ni proceso automático aprueba ni publica. |
| I9 | Reproducibilidad: huellas, versión del algoritmo y versión del validador guardadas en cada versión. |
| I10 | El PDF muestra el estado real: «PUBLICADO vN · aprobado por … el …» o «BORRADOR / VALIDADO / APROBADO (no oficial)». |
| I11 | Lo aprendido solo produce preferencias (nivel PREFERENCIA) y parámetros blandos; nunca crea, modifica ni relaja reglas obligatorias (AH2-012, AH2-025). |
| I12 | Las horas suplementarias PART nunca se asignan sin una autorización vigente, con validación normativa `validada` y la política de la sucursal habilitada (AH2-024). |

### 5.4 Comparación entre versiones

`diffHorarios(a, b)` (puro) mide:
- personas afectadas;
- francos movidos;
- cambios de tipo de turno (mañana, tarde o cierre);
- desvío de horario en minutos (distingue un ajuste de 30 min de un cambio de turno);
- horas por persona;
- cobertura y faltantes.

Se usa para aprobar (frente al vigente), para auditar (entre dos versiones cualesquiera) y para el registro del ciclo.

## 6. Continuidad y rotación entre ciclos

**REQUISITO:**
- tomar como referencia el último horario publicado y vigente;
- no cambiar jornadas, francos ni horarios sin necesidad;
- priorizar la continuidad cuando el POM varía poco;
- permitir ajustes ante cambios importantes de demanda;
- rotar de forma equitativa entre ciclos.

### 6.1 Orden de prioridades (lexicográfico, PROPUESTO)

1. **Reglas obligatorias**, normativas y operativas, y disponibilidad. Nunca se negocian.
2. **Horas contractuales exigibles** (AH2-020). Nunca se reducen para cubrir.
3. **Cobertura:** alcanzar el objetivo de la sucursal (091: 95 %) o la mejor cobertura factible, sin vaciar picos.
4. **Estabilidad** dentro del ciclo, o **rotación** en la primera semana de un ciclo nuevo.
5. Sobrantes y preferencias.

### 6.2 Mecanismo simple: reutilizar el multi-arranque existente (tramo C)

El motor ya acepta `semillas`, que son semanas iniciales que la DP vuelve a optimizar. Se agregan **candidatos** sin cambiar la cascada:
- **`mantener-vigente`:** el horario vigente reaplicado tal cual al nuevo POM. Si valida y cumple el objetivo de cobertura, es la propuesta de cero cambios.
- **`continuidad`:** multi-arranque sembrado con el horario vigente.
- **`rotacion`** (solo en la primera semana del ciclo): semillas rotadas, por ejemplo intercambiando los patrones de mañana y cierre entre personas con desequilibrio acumulado, más sesgos de equidad calculados sobre el historial efectivo.

**Selección** (extiende la regla aprobada de AH2-020):
1. Elegibles: candidatos validados sin violaciones nuevas y sin bajar horas de nadie.
2. `mejor` = cobertura máxima entre los elegibles.
3. Aceptables: los elegibles con `cobertura ≥ mejor − tolerancia`.
   - La tolerancia es configurable y se calibra con benchmark (D9).
   - **Nunca** un aceptable baja del objetivo si el mejor lo alcanza.
4. Entre los aceptables:
   - dentro del ciclo, menor cantidad de cambios (`diffHorarios`: personas afectadas, francos y tipo de turno, en ese orden);
   - en la primera semana del ciclo, mayor mejora de equidad.
5. Empate: el respaldo.

### 6.3 Variación de la demanda

`compararDemanda(anterior, nueva)` (puro), con las matrices alineadas por día y franja. Calcula:
- Δ de horas-caja total y por día;
- franjas con |Δ| ≥ 1;
- cambios en picos;
- **cobertura proyectada del horario vigente sobre el POM nuevo**.

Clasificación inicial (los umbrales son configurables y se calibran con benchmark; no se inventan constantes):
- **Estable:** el vigente sigue cubriendo al menos el objetivo y sin franjas pico nuevas sin cubrir → se prioriza `mantener-vigente` o `continuidad`.
- **Cambio moderado:** se ajusta solo lo necesario (`continuidad` con tolerancia).
- **Cambio importante** (pico comercial, evento): se permiten cambios mayores, **con explicación** («la demanda del sábado 19–21 h subió 3 cajas»).

### 6.4 Equidad

Se mide por colaborador sobre el historial efectivo, **normalizada por semanas efectivamente trabajadas** (las semanas de ausencia no se cuentan):
- proporción de mañanas, tardes y cierres;
- fines de semana trabajados;
- francos en fin de semana.

Las reglas individuales de turno fijo (`siempre_cierre`, `solo_turno`) excluyen a esa persona de la rotación de ese turno. Ante un cambio de plantilla o de contrato, la equidad se reinicia de forma proporcional, sin borrar historia.

## 7. Ausencias y replanificación parcial

**REQUISITO:**
- vacaciones, licencias, accidentes y ausencias;
- la persona sigue en la nómina;
- se registran las fechas efectivas de indisponibilidad;
- se reorganiza solo lo afectado cuando sea posible;
- nunca se tocan jornadas ya transcurridas.

- **Registro:** `Ausencia` sin diagnósticos médicos (§3.2). Estados: registrada, confirmada o anulada. Se audita.
- **Disponibilidad efectiva** (puro): `disponibilidad(colaborador, fecha) = roster − ausencias confirmadas − reglas`. Se traduce a las excepciones que el motor ya entiende (indisponibilidad por día o franja), así que **el motor no cambia** para planificar semanas futuras.
- **Replanificación parcial** sobre un horario PUBLICADO, desde una fecha de corte `F` ≥ mañana:
  1. Se **congelan** todas las jornadas anteriores a `F` como «jornadas fijas». Esto requiere un tipo de excepción nuevo (tramo D), que el validador ya puede verificar porque compara contra la versión base.
  2. Se vuelve a optimizar solo desde `F` con el candidato `continuidad` (§6.2): primero los cambios mínimos.
  3. Se valida la **semana completa**, incluidos los días congelados y el descanso de 12 h en el borde, además de la semana siguiente.
  4. Se muestra el diff: quién cambia, por qué, la cobertura antes y después, y los riesgos.
  5. Pasa por aprobación y publicación. La nueva versión **reemplaza solo desde `F`**.
- **Orden de recursos para cubrir una ausencia** (política de horas PART, AH2-024):
  1. redistribuir la dotación habitual dentro de sus contratos (horas ≤ objetivo);
  2. auxiliares disponibles;
  3. eventuales disponibles;
  4. informar el déficit;
  5. solo como recurso **excepcional** y con autorización: horas suplementarias PART (§8).
- **Regreso:** al vencer `hasta`, la persona vuelve a ser asignable en la siguiente planificación o replanificación. No hay cambios automáticos sobre lo publicado.

## 8. Política de horas PART y horas suplementarias (capacidad futura separada)

**REQUISITO del propietario (AH2-024):**
- el objetivo habitual es de 32 h semanales;
- primero se usa la dotación habitual, después auxiliares y eventuales;
- las horas suplementarias PART son un recurso excepcional, ante ausencias prolongadas o contingencias;
- requieren autorización y validación legal y convencional;
- nunca se asignan automáticamente ni se convierten en el objetivo habitual.

**Estado actual (correcto):** el motor no las asigna. Su tope es min(ficha, perfil) y **en este tramo no cambia**.

**Diseño futuro (S1, PROPUESTO):**
- **Autorización explícita por persona y período** (`AutorizacionHorasSuplementarias`):
  - motivo vinculado a una ausencia o contingencia;
  - horas adicionales máximas por semana;
  - validación normativa con su fuente;
  - quién la solicitó y quién la autorizó.
- **Condiciones de uso, todas a la vez:**
  - la política de la sucursal está habilitada (apagada por defecto);
  - la autorización está vigente;
  - la validación normativa está en estado `validada`;
  - queda déficit **después** de la dotación habitual, AUX y eventuales.
- **Integración en el motor: una pasada 4 «suplementarias»** sobre el déficit residual, posterior a eventuales.
  - El objetivo de 32 h de la pasada 1 **no cambia**.
  - Las horas extra solo cubren el déficit residual, dentro del tope autorizado y del perfil legal.
- **Validador:** H-P1 controla contra el tope efectivo (perfil + autorización vigente). Sin autorización, superar las 32 h es una violación, como hoy.
- **Visibilidad:** métrica «horas suplementarias usadas» (en la semana 47 fueron 0), aviso en la aprobación, marca en el PDF y registro en la memoria del ciclo.

## 9. Aprendizaje independiente por sucursal: memoria compartida, sin modelos propios

**REQUISITO:** cada sucursal aprende de su propio historial. Se registran:
- el horario generado y la estrategia del optimizador;
- las modificaciones manuales con su motivo;
- el horario aprobado;
- cobertura, faltantes y sobrantes;
- la equidad;
- las preferencias confirmadas;
- los resultados por ciclo.

Se distinguen las correcciones recurrentes de las excepciones temporales. **Lo aprendido nunca modifica restricciones legales ni reglas obligatorias.**

**Decisión de diseño (PROPUESTO):** no se entrenan modelos por sucursal. Hay **un motor compartido** y cada sucursal tiene una **memoria** con:
1. un **registro de cada ciclo** (`RegistroCiclo`, `Modificacion`), que solo se agrega;
2. **preferencias** derivadas y confirmadas por personas (`PreferenciaSucursal`);
3. **parámetros** propios, todos blandos:
   - pesos por franja (ya existen como «criterios de cobertura»);
   - tolerancia de continuidad;
   - umbrales de variación de demanda;
   - orden de las estrategias del multi-arranque según cuál gana más seguido en esa sucursal (el respaldo **nunca** se quita).

**Ciclo de aprendizaje:**

```text
Modificación con motivo y clasificación
  ├─ excepcion-temporal / contingencia  → NO se aprende (queda en el registro)
  ├─ correccion-operativa               → alimenta métricas del motor (p. ej. franjas mal cubiertas)
  └─ preferencia-recurrente             → candidata si se repite (≥ N veces en ≥ 2 ciclos, misma dirección)
         → PreferenciaSucursal «propuesta» → el supervisor CONFIRMA o descarta
         → «confirmada»: se compila como preferencia blanda (sesgo) para el motor
         → vence o se retira sola si deja de observarse o si contradice una regla
```

**Salvaguardas (I11):**
- `PreferenciaSucursal.nivel` es siempre `PREFERENCIA`; el tipo no admite otro valor.
- Lo aprendido solo entra como sesgo blando (`preferencias_turno` y `pesosFranja`), igual que hoy.
- Una preferencia que choca con una regla obligatoria se descarta y queda registrada.
- El validador independiente no lee la memoria.
- Todo lo aprendido es explicable («se prefiere mañana para X por 4 correcciones confirmadas en 2 ciclos»), reversible y auditado.

**Base existente:** `derivarAprendizajes`, `derivarCriteriosCobertura`, `pesoTemporal` y `calcularSesgoAprendizaje` en `src/utils/preferencias.ts`. Faltan IDs estables (ID-01), motivo, clasificación, confirmación y persistencia por sucursal.

**Futuro:** compartir patrones **agregados y anónimos** entre sucursales queda **fuera de alcance**. Requeriría una decisión explícita (opt-in).

## 10. Arquitectura para 160 sucursales

### 10.1 Estructura organizacional y roles

**REQUISITO:**
- estructura empresa → sucursales → usuarios;
- supervisores en una o varias sucursales y varios supervisores por sucursal;
- directores regionales con acceso a varios locales;
- permisos por rol y auditoría.

| Rol | Ámbito | Puede |
|---|---|---|
| admin-empresa | empresa | Configurar políticas, calendario de ciclos, regiones, sucursales y membresías; ver y publicar en cualquier sucursal; auditar. |
| director-regional | región (o conjunto de sucursales) | Ver todas sus sucursales; aprobar y publicar si la política lo permite; comparar indicadores; no cambia reglas de empresa. |
| aprobador | sucursal | Aprobar y publicar; registrar y confirmar ausencias. |
| supervisor | una o varias sucursales | Cargar demanda, generar, editar, validar, enviar a aprobación, registrar ausencias, confirmar preferencias y, si `aprobacionPropiaPermitida`, aprobar. |
| auditor | empresa o región | Solo lectura, incluido el registro de auditoría. |

Un usuario tiene **varias membresías** (por ejemplo, supervisor de 091 y de 112). La sucursal activa sale de esas membresías, nunca de un texto libre.

### 10.2 Aislamiento verificable (políticas de acceso de Supabase)

- **Una función por política:** `aliada.tiene_acceso(p_sucursal uuid, p_roles text[]) returns boolean`.
  - `security definer` con `search_path` fijo.
  - Resuelve la membresía directa, por región o por empresa.
- **Políticas por tabla:**
  - leer: `using (aliada.tiene_acceso(sucursal_id, '{…lectura…}'))`;
  - escribir: según el rol de cada tabla;
  - `eventos_auditoria`: **sin** UPDATE ni DELETE (solo se agrega).
- **Pruebas automatizadas de las políticas:**
  - se corren sobre Supabase local (CLI gratuita) en CI;
  - escenario: 2 empresas, 2 regiones, 4 sucursales y usuarios de cada rol;
  - para cada tabla y rol, casos positivos y negativos: nadie lee ni escribe otra sucursal, el director ve solo su región y el auditor no escribe;
  - las pruebas son el **criterio de aceptación** de P1.
- **Proyecto compartido con Prestify (D13):** este diseño no lo toca. Para comercializar, se recomienda aislar Aliada en un proyecto o esquema propio, además del sitio, sin las funciones de pago.

### 10.3 Configuración y reglas por sucursal con vigencia

- Las **reglas v2** (#11, `src/reglas/reglasV2.ts`) tienen ámbito empresa, región, sucursal, grupo o persona, vigencia, nivel y auditoría.
- Herencia: la empresa define valores por defecto (por ejemplo, el perfil de horas del convenio) y la sucursal sobrescribe lo operativo.
- **Las reglas normativas no se pueden relajar** por sucursal, por preferencia ni por aprendizaje (AH2-012).
- La UI muestra el valor efectivo y su origen.

### 10.4 Publicación con verificación en el servidor (bajo costo)

La validación corre en el navegador para dar respuesta inmediata. **Publicar**, en cambio, pasa por una **Netlify Function** (`publicar`) que:
1. recibe el JWT del usuario: no usa la clave de servicio, así que las políticas de acceso siguen aplicando;
2. carga la versión y sus entradas por huella;
3. **vuelve a ejecutar el mismo validador TypeScript** (el mismo código, versionado);
4. llama a una RPC transaccional `publicar_version(version_id, numero_esperado)`, que comprueba el estado, el rol, la ausencia de otra publicada en el período (I1) y que no se cubren días pasados (I4), y registra los eventos.

Costo: unas 160 sucursales × pocas publicaciones por semana, dentro del plan gratuito de funciones. Así un cliente modificado no puede publicar algo inválido (D10).

### 10.5 Generación escalable y reproducible

- **Web Worker** (`docs/proposals/AH2-020_WEB_WORKER_GENERACION.md`): la interfaz nunca se bloquea; hay botón Cancelar; si no hay soporte, se cae al hilo principal; prueba de equivalencia de resultados.
- **Corte por trabajo** en lugar de por tiempo (D12): número fijo de pasadas y estrategias, con el tiempo solo como límite de seguridad. La misma entrada da el mismo resultado en cualquier equipo. `versionAlgoritmo` cambia y el benchmark de 200 escenarios documenta cualquier diferencia.
- **El cálculo sigue en el navegador:** sin costo de servidor por sucursal. Si a futuro hiciera falta un solver exacto (#13), sería un servicio aparte y **opcional**, decisión del propietario.

### 10.6 Volumen, rendimiento y caché

- **Filas:** 160 sucursales × 52 semanas × ~3 versiones ≈ **25 000 por año**.
- **Tamaño:** con 50–150 KB por versión, **1,2–3,7 GB por año**. Mitigación:
  - listados sin el jsonb (columnas indexadas);
  - archivar versiones DESCARTADAS después de 12 meses (D6), conservando siempre las publicadas.
- **Copia local:** pasa a ser **caché de lectura** con cola de escrituras de borradores y detección de conflictos por versión. Publicar y aprobar requieren conexión.

### 10.7 Independencia de POM

- `MatrizDemanda` normalizada con horario operativo por sucursal, que puede diferir de la grilla de 31 franjas del POM.
- Adaptadores:
  - `pom-pdf` (actual);
  - `manual` (planilla mínima);
  - `api` (conexión directa autorizada en el futuro, con credenciales por empresa guardadas en el servidor y nunca en el navegador).
- Cada importación guarda fuente, referencia y huella. Nada en el motor ni en el flujo depende de POM.

### 10.8 Despliegue gradual

- La bandera `flujoPublicacionActivo` se activa por sucursal: la 091 primero, después por región.
- Las sucursales sin la bandera funcionan como hoy.
- Indicadores por sucursal para avanzar de ola:
  - publicaciones en término;
  - 100 % publicadas VALIDADAS;
  - reemplazos por semana;
  - cobertura frente al objetivo;
  - cambios frente al vigente;
  - tiempo de generación;
  - modificaciones manuales por ciclo (deben bajar con el tiempo).

## 11. Evidencia del primer horario real (semana 47)

Métricas **agregadas informadas por el propietario**. No se pudieron reproducir desde el repositorio, porque los datos reales no están en GitHub y no deben estarlo.

| Métrica | Valor |
|---|---|
| Demanda POM | 406 horas-caja |
| Cobertura Aliada | 99,14 % |
| Faltantes | 3,5 horas-caja |
| Sobrantes | 0,5 horas-caja |
| Horas suplementarias PART utilizadas | 0 |

**Alcance de la evidencia:**
- demuestra coherencia entre la demanda y la planificación generada;
- **no** certifica optimalidad global ni cumplimiento jurídico;
- no se publican nombres, horarios individuales ni documentos laborales.

El fixture **anonimizado** de la semana 47 que está en el repo tiene sus propias métricas (CURRENT_WORK) y no debe confundirse con esta evidencia real.

## 12. Riesgos de seguridad, migración y compatibilidad

| Riesgo | Mitigación |
|---|---|
| Acceso por usuario a escala (brecha 1) | P1 con membresías y pruebas de políticas antes de activar más sucursales. |
| Proyecto Supabase y sitio compartidos con Prestify (brecha 17; tablas `al_*` y `ep_*` sin políticas de acceso según el MASTER, sin reverificar; funciones de pago desplegadas en `al-iada`) | Reverificación en solo lectura (P0). Decisión de aislamiento (D13). Ninguna migración sin coordinación, respaldo y reversión. |
| Validación falsificada por un cliente modificado | La publicación revalida en el servidor (§10.4). |
| Migración de `semanas_historial` | Copia idempotente; la tabla original sigue sin cambios; doble lectura durante la transición; reversión documentada. |
| Semanas legadas sin estado | No se reinterpretan como PUBLICADAS. Para la rotación cuentan solo transitoriamente como «legado presunto vigente», hasta tener 4 semanas publicadas (D4). |
| Cambio de sesgos de rotación al pasar al historial efectivo | Despliegue por sucursal y comparación antes / después. |
| Determinismo entre equipos | Corte por trabajo (W2); hasta entonces, `generacion.omitidas` registra lo omitido. |
| Datos personales | Fixtures sintéticos; ausencias sin diagnóstico; logs sin nombres; nada laboral en GitHub. |
| Aprendizaje que «se cuela» como regla | El tipo admite solo nivel PREFERENCIA, el validador no lee la memoria y hay pruebas de que una preferencia nunca relaja una regla. |
| Horas suplementarias asignadas por error | Apagadas por defecto; triple condición (política, autorización y validación normativa); el validador las controla; aviso y marca en el PDF. |
| Costos | Sin servicios nuevos: funciones y base en los planes actuales; cálculo en el cliente. |

## 13. Plan de implementación en PR pequeños, ordenados por dependencia

Cada PR es aislado, con pruebas, CURRENT_WORK y evidencia, y se entrega en borrador. Ninguno se fusiona ni se publica sin autorización. Los que llevan migración requieren además autorización expresa.

```text
 PR-B0 (este, documental)
   │
   ├─► B1 dominio planificación ──► U1 flujo de estados (091, jsonb, bandera) ──► U2 ciclos + vigencia + rotación efectiva
   │        │                                                                         │
   │        ├─► B2 dominio contingencias ──────────────────────────────┐              │
   │        ├─► B3 dominio memoria ──► U3 modificaciones con motivo     │              │
   │        └─► B4 fuente de demanda (adaptador pom-pdf + manual)      │              │
   │                                                                    │              │
   ├─► W1 Web Worker ──► W2 corte por trabajo (decisión D12)            │              │
   │                                                                    ▼              ▼
   ├─► P0 reverificación esquema (solo lectura) ──► P1 empresa/región/sucursal/membresías + RLS + pruebas  [MIGRACIÓN]
   │                                                   └─► P2 versiones/publicaciones/auditoría + RPC + Function publicar  [MIGRACIÓN]
   │                                                         ├─► P3 ausencias (tabla + UI de registro)  [MIGRACIÓN]
   │                                                         ├─► P4 memoria (tablas + confirmación de preferencias)  [MIGRACIÓN]
   │                                                         └─► P5 reglas v2 + IDs estables (RULES-01 / ID-01)  [MIGRACIÓN]
   │
   └─► Motor (tramos C/D, autorización de motor): C1 candidatos mantener/continuidad ──► C2 rotación de ciclo
                                                  D1 replanificación parcial (jornadas fijas)  ──► S1 horas suplementarias (tras validación normativa)
```

| PR | Contenido | Depende de | Migración | Toca el motor |
|---|---|---|---|---|
| B1 | `src/planificacion/`: ciclos, estados y transiciones, vigencia, historial efectivo, huellas y diff. Funciones puras. | B0 | No | No |
| B2 | `src/contingencias/`: ausencias, disponibilidad efectiva y traducción a excepciones. Puro. | B1 | No | No |
| B3 | `src/memoria/`: registro de ciclo, clasificación, derivación con salvaguardas y equidad. Puro. | B1 | No | No |
| B4 | `src/demanda/`: `MatrizDemanda`, adaptadores `pom-pdf` (envuelve el parser actual) y `manual`, huella. | B1 | No | No |
| W1 | Web Worker con cancelación y caída al hilo principal. | — | No | No (mismo cálculo) |
| W2 | Corte por trabajo. | W1, D12 | No | Sí (presupuesto; benchmark documentado) |
| U1 | Flujo en la UI de la 091 detrás de una bandera: estados, validación con huella, aprobar y publicar, PDF con estado, bloqueo sin VALIDADO. | B1 | No | No |
| U2 | Ciclos configurables, «Último horario» = vigente, rotación por historial efectivo, legado transitorio. | U1 | No | No (solo cambian sesgos de entrada) |
| U3 | Motivo y clasificación en cada modificación manual; registro del ciclo. | B3, U1 | No | No |
| P0 | Inventario de solo lectura del esquema y las políticas reales, y plan de aislamiento respecto de Prestify. | — | No | No |
| P1 | Empresa, región, sucursal, membresías, función `tiene_acceso`, políticas y pruebas de políticas en CI. | P0 | **Sí** | No |
| P2 | `versiones_horario`, `publicaciones`, `eventos_auditoria`, RPC `publicar_version`, Function `publicar` y copia desde `semanas_historial`. | P1, U1 | **Sí** | No |
| P3 | Tabla `ausencias` y UI de registro y confirmación. | P2, B2 | **Sí** | No |
| P4 | Tablas de memoria y UI de preferencias propuestas y confirmadas. | P2, B3, U3 | **Sí** | No |
| P5 | Reglas v2 e IDs estables (SQL propuesto en `docs/proposals/`). | P1 | **Sí** | No |
| C1 | Candidatos `mantener-vigente` y `continuidad` con selección por mínimos cambios dentro de la tolerancia. | U2, B4 | No | **Sí** (autorización de motor) |
| C2 | Candidato `rotacion` y sesgos de equidad en la primera semana del ciclo. | C1, B3 | No | **Sí** |
| D1 | Replanificación parcial desde una fecha con jornadas fijas. | P3, C1 | No | **Sí** |
| S1 | Horas suplementarias PART: autorización, pasada 4 y validador. | D1, validación normativa | Sí (tabla) | **Sí** |

## 14. Pruebas y criterios de aceptación por PR

**Transversal a todos los PR:**
- `tsc`, Vitest, build y Playwright en verde;
- benchmark de 200 escenarios **idéntico** en todo PR que no toque el motor;
- sin datos personales;
- CURRENT_WORK actualizado.

- **B1:**
  - ciclos de 1, 4 y 5 semanas;
  - `validarCalendario` rechaza superposiciones, huecos y un inicio que no es lunes o un fin que no es domingo;
  - una semana que cruza el fin de mes sin ciclo nuevo **no** es primera semana del ciclo (#44 (e)); con un ciclo nuevo declarado, sí (#44 (b));
  - transiciones válidas e inválidas, cada una con error tipado:
    · VALIDADO caduca si cambia cualquier huella;
    · no se publica sin VALIDADO ni aprobación;
    · no se edita un publicado;
    · no se cubren días pasados;
    · ningún agente actúa;
  - prueba de propiedad: con publicaciones y reemplazos aleatorios, ningún lunes tiene más de una vigente (I1);
  - `historialEfectivo` ignora borradores, versiones repetidas y semanas futuras (I5, #44 (g));
  - `diffHorarios` distingue un ajuste de 30 min de un cambio de turno;
  - las huellas son estables ante el orden de claves y cambian ante cualquier cambio de celda, regla o roster.
- **B2:**
  - una persona ausente sigue en el roster y no es asignable en esas fechas;
  - una ausencia abierta (`hasta = null`);
  - alcance parcial por franja;
  - anulada, la ausencia no afecta;
  - la traducción a excepciones produce el mismo resultado del motor que hoy dan las excepciones equivalentes.
- **B3:**
  - una excepción temporal nunca genera una preferencia;
  - una corrección recurrente (N veces en 2 ciclos) genera una preferencia **propuesta**, nunca confirmada sola;
  - una preferencia confirmada solo produce sesgos blandos;
  - una preferencia en conflicto con una regla obligatoria se descarta;
  - la equidad se normaliza por semanas efectivas y excluye ausencias.
- **B4:**
  - el adaptador `pom-pdf` produce la misma matriz que el parser actual en todos los fixtures;
  - la carga `manual` valida dimensiones y valores;
  - la huella es estable.
- **W1:**
  - mismos resultados en el worker y en el hilo principal (40 escenarios y semana 47);
  - la tarea larga más larga del hilo principal dura menos de 200 ms con 9, 20, 35 y 55 cajeros a 1×, 4× y 6×;
  - Cancelar funciona.
- **W2:**
  - misma entrada → mismo resultado bajo CPU 1× y 6×;
  - el benchmark documenta cualquier diferencia frente a la versión anterior.
- **U1:**
  - con la bandera apagada, las 11 pruebas E2E actuales pasan sin cambios;
  - con la bandera encendida:
    · un BORRADOR no se publica y la UI explica por qué;
    · VALIDADO → APROBADO → PUBLICADO funciona;
    · el PDF muestra «PUBLICADO vN · aprobado por … el …»;
    · regenerar un publicado crea un borrador nuevo y, al publicarlo, el anterior pasa a REEMPLAZADO;
    · recargar conserva estado y eventos.
- **U2:**
  - «Último horario» muestra el vigente;
  - la rotación con versiones repetidas o borradores da el mismo sesgo que sin ellos;
  - modalidad mensual: una publicación cubre exactamente 4 o 5 semanas;
  - semanas legadas sin regresión.
- **U3:** cada modificación exige motivo; el registro del ciclo calcula cobertura, faltantes, sobrantes, equidad y cambios frente al vigente.
- **P0:** inventario de tablas, políticas, funciones y roles reales, con evidencia y sin escrituras.
- **P1:** las pruebas de políticas (positivas y negativas por rol y tabla) pasan en Supabase local en CI; la sucursal activa sale de las membresías; hay reversión probada.
- **P2:**
  - dos publicaciones concurrentes para el mismo período: una gana y la otra recibe un aviso de conflicto;
  - una publicación con validación falsificada es rechazada por la Function;
  - la copia desde `semanas_historial` es idempotente;
  - la auditoría es solo de agregado.
- **P3, P4 y P5:** criterios de B2, B3 y #11/#9 aplicados con persistencia, más pruebas de políticas de acceso de las tablas nuevas.
- **C1:**
  - POM idéntico → `mantener-vigente`, con cero cambios si valida y cumple el objetivo;
  - POM similar en las semanas 2, 3 y 4 del ciclo → cambios pequeños (#44 (a));
  - pico intramensual → cambios mayores con explicación (#44 (f));
  - nunca baja del objetivo si el mejor lo alcanza;
  - ninguna regresión de cobertura ni de horas frente al respaldo (AH2-020).
- **C2:**
  - ciclo nuevo con el mismo POM → se observa rotación sin bajar la cobertura (#44 (b) y (c));
  - una regla de turno fijo prevalece (#44 (d)).
- **D1:**
  - ausencia el miércoles: lunes y martes intactos;
  - se modifica solo desde la fecha de corte con mínimos cambios;
  - se revalida la semana completa;
  - se crea un PDF nuevo versionado (#44).
- **S1:**
  - sin autorización, más de 32 h es una violación;
  - con autorización y validación normativa, se usan solo para el déficit residual después de AUX y eventuales;
  - se informan y se marcan en el PDF.

**Simulación de escala** (B1 a U2, datos sintéticos):
- 160 sucursales × 6 ciclos con herencia empresa → región → sucursal;
- cero cruces de datos;
- cada valor efectivo informa su origen;
- la resolución de vigencia e historial tarda menos de 50 ms por sucursal.

## 15. Decisiones pendientes del propietario

| ID | Pregunta | Propuesta |
|---|---|---|
| D1 | ~~¿VALIDADO como estado?~~ **Resuelta por el propietario:** BORRADOR, VALIDADO, APROBADO y PUBLICADO. | VALIDADO ligado a huella; caduca ante cualquier cambio (§5.1). |
| D2 | ¿El ciclo empieza en lunes y termina en domingo? | Sí. |
| D3 | ¿Puede el supervisor aprobar su propio horario? | Configurable por sucursal. En la 091, sí durante U1, siempre auditado. |
| D4 | ¿Cómo se tratan las semanas legadas? | Presunto vigente transitorio, solo para la rotación; nunca se muestran como PUBLICADAS. |
| D5 | ¿Se publica como «oficial» mientras siga pendiente la validación jurídica de 32 h? | Sí, con la leyenda correspondiente. Decide el propietario. |
| D6 | ¿Cuánto se retienen las versiones descartadas? | 12 meses y después se archivan. Las publicadas nunca se borran. |
| D7 | ¿La empresa propone el calendario de ciclos? | Sí; cada sucursal lo confirma. |
| D8 | ~~¿Una o varias empresas?~~ **Resuelta:** una misma empresa, al menos 160 sucursales y directores regionales. | El modelo admite varias empresas sin costo adicional (comercializable). |
| D9 | Tolerancia de cobertura para preferir continuidad, y umbrales de variación de demanda. | Configurables por sucursal y calibrados con benchmark en el tramo C. No se fijan ahora. |
| D10 | ¿Se verifica la publicación en el servidor con una Netlify Function? | Sí (§10.4). |
| D11 | Catálogo de motivos de modificación. | Lista base editable por la empresa. |
| D12 | ¿Corte por trabajo en lugar de por tiempo? | Sí, con el benchmark documentado (W2). |
| D13 | ¿Se aísla Aliada de Prestify (proyecto Supabase y sitio Netlify)? | Recomendado antes de comercializar. Fuera del alcance de este tramo. |
