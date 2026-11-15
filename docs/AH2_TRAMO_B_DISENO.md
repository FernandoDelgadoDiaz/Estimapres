# ALIADA HORARIOS 2.0 — TRAMO B: arquitectura de planificación por ciclos para 160 sucursales

**Versión:** 3.1, revisión de seguridad P2 (15/11/2026), sobre la v3. Incorpora las 8 correcciones obligatorias de la «REVISIÓN FINAL DEL DISEÑO B» del propietario sobre la v2 del PR #46.

**Estado:**
- **Dirección general APROBADA** por el propietario (15/11/2026).
- **Detalle técnico PROPUESTO.**
- **Implementación, merge, migraciones y publicación NO AUTORIZADOS.** Aprobar la dirección no autoriza ningún PR de código, migración ni publicación: cada uno requiere una autorización expresa (§15).

**Base:** `main@905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. En producción: deploy Netlify `6af8ee2d`, PR #45 integrado (contrato PART y motor «B conjunta»).

**Autoridad:** `docs/ALIADA_HORARIOS_MASTER.md`.
- **REQUISITO:** pedido o aprobado por el propietario.
- **PROPUESTO:** diseño técnico pendiente.
- **CRITERIO RECOMENDADO:** sugerencia de diseño que no reemplaza una autorización.
- Si algo contradice el MASTER, prevalece el MASTER.

**Issues:** #44, #12, #10, #11, #9, #28, #13 y #14. Decisiones: AH2-015…AH2-017, AH2-020, AH2-022 y AH2-023…AH2-034.

### Correcciones de la v3

| # | Corrección obligatoria | Dónde |
|---|---|---|
| 1 | La revisión **local de prueba** se separa de la **publicación oficial**. Lo oficial exige permisos verificados, transacción en el servidor y revalidación en el servidor; nunca solo JSON local. | §5.1, §5.2, §10.4, §13 |
| 2 | **Vigencia parcial por intervalos efectivos** a nivel de día: reemplazo desde el miércoles sin alterar lunes ni martes. Unicidad sin solapamientos, también bajo concurrencia. | §5.4 |
| 3 | El **historial efectivo** se resuelve fecha por fecha con la versión vigente en ese día, incluidas versiones reemplazadas después. Los borradores nunca cuentan. | §6.4 |
| 4 | La continuidad **no sacrifica cobertura arbitrariamente**: mínimo de 95 % en la 091, **franjas pico protegidas**, tolerancia en 0 hasta calibrarla con benchmark. | §6.2 |
| 5 | La **validación técnica** del horario se separa de la **validación jurídica** de los perfiles. Nunca se declara conformidad legal sin fuentes verificadas. | §5.6 |
| 6 | D2–D13: **criterio de diseño recomendado** separado de la **autorización expresa** del propietario. | §15 |
| 7 | **Orden de los PR:** ningún flujo de publicación oficial antes de permisos, aislamiento y validación en el servidor. | §13 |
| 8 | **Corte por trabajo reproducible.** Toda interrupción por límite de seguridad queda registrada y no se presenta como búsqueda completa. | §10.5 |

---

## 0. Resumen ejecutivo: una sola arquitectura

```text
          ┌─────────────────────────── MEMORIA DE LA SUCURSAL ◄──────────────────────────┐
          ▼                                                                               │
 FUENTE DE DEMANDA ──► PLANIFICACIÓN ──► VALIDACIÓN TÉCNICA ──► APROBACIÓN ──► PUBLICACIÓN OFICIAL ──► EJECUCIÓN
 (POM PDF hoy; API     motor central     validador              humana          servidor: permisos,     (ausencias →
  autorizada mañana)   compartido +      independiente          (roles)         transacción,            reemplazo parcial
                       parámetros de     (cliente: inmediata;                   revalidación,           por intervalos,
                       la sucursal        servidor: obligatoria)                vigencia por día        nunca el pasado)
          ▲                                                                                               │
          └──── CONFIGURACIÓN DE LA SUCURSAL (empresa → región → sucursal) ◄──────────────────────────────┘
```

**Principios:**
1. **Un motor central y un validador** para todas las sucursales. Cada sucursal aporta solo datos y parámetros propios; nada es específico de la 091.
2. **El validador independiente es la única compuerta.** En la publicación oficial corre **en el servidor**.
3. **Eventos que solo se agregan.** «Vigente», «historial efectivo» y «memoria» se derivan de ellos.
4. **Núcleo de funciones puras** (ciclos, intervalos de vigencia, diffs, equidad, ausencias, aprendizaje), probables sin base de datos.
5. **Lo oficial solo en el servidor.** El navegador puede preparar, validar y revisar como **prueba local**. Publicar oficialmente requiere identidad, membresía, permisos y una transacción en el servidor.
6. **Validez técnica ≠ conformidad jurídica.** El sistema informa si un horario cumple el **perfil configurado**, no si cumple la ley.
7. **Costo bajo.** Supabase y Netlify existentes y cálculo en el navegador (Web Worker), sin servicios pagos.

## 1. Diagnóstico de la arquitectura actual y brechas para 160 sucursales

Verificado en código y producción el 15/11/2026, salvo donde dice INFERIDO.

| # | Área | Situación actual | Brecha | Gravedad | Cierra |
|---|---|---|---|---|---|
| 1 | Identidad y acceso | La migración del repo filtra `semanas_historial`, `reglas_configurables`, `correcciones_manuales` y `aprendizajes_derivados` por usuario (`local_id = auth.uid()`). | No permite varios supervisores por sucursal, aprobador distinto del supervisor ni directores regionales. | **Bloqueante** | P1 |
| 2 | Sucursal activa | Texto libre en localStorage (`aliada_sucursal_actual`, por defecto `091`). | Debe salir de las membresías. | Alta | P1 |
| 3 | Estructura organizacional | `sucursal_id` es solo un texto. INFERIDO: la columna existe en la base real pero no en la migración del repo. | Falta la jerarquía empresa → región → sucursal → usuarios. | **Bloqueante** | P1 |
| 4 | Estados y publicación | Las versiones se guardan por lunes, sin estado. Todo se escribe desde el cliente. | Faltan estados, publicación oficial en el servidor, responsables y auditoría. | Alta | B1, U1, P2, O1 |
| 5 | Vigencia | No existe. «Último horario» es la versión generada más reciente. | Falta vigencia por intervalos de día, con reemplazo parcial y unicidad bajo concurrencia. | Alta | B1, P2, O1 |
| 6 | Ciclos | No existen. | Faltan ciclos explícitos con inicio y fin, semanales o mensuales. | Alta | B1, U2 |
| 7 | Rotación y equidad | Usa la última versión por lunes de las 3 semanas más recientes, sean borradores o futuras (`preferencias.ts:110,144`). | Debe usar la versión vigente en cada fecha. | Media | B1, U2 |
| 8 | Continuidad | El motor no conoce el horario vigente. | Falta un candidato de continuidad con cobertura y picos protegidos. | Media | C1 |
| 9 | Ausencias | Excepciones por fecha solo para AUX y eventuales. | Falta un módulo unificado con replanificación parcial. | Alta | B2, P3, D1 |
| 10 | Horas suplementarias PART | No existen (correcto). | Capacidad futura separada y auditable. | Media | S1 |
| 11 | Aprendizaje | Correcciones identificadas por **nombre** y sin motivo; aprendizajes derivados al vuelo; solo sesgo blando (correcto). | Faltan IDs estables, motivo, clasificación, confirmación y memoria por sucursal. | Media | B3, U3, P4 |
| 12 | Reglas | Conviven `reglas_configurables` (legado) y `src/reglas/reglasV2.ts` con SQL propuesto no aplicado. | Falta adoptar reglas v2 con herencia. | Media | P5 |
| 13 | Interfaz durante la generación | El cálculo bloquea la interfaz: 0,5–3 s en la 091 y hasta 21 s con 55 cajeros en equipos lentos. | Web Worker. | Alta (sucursales grandes) | W1 |
| 14 | Reproducibilidad | El motor no usa azar. Los cortes son **por tiempo**: 6 s en la pasada 1 (`pasada1-fullpart.ts:152`, **corte no registrado**) y 20 s en el multi-arranque (las estrategias omitidas sí se registran). | Corte por trabajo y registro de toda interrupción. | Media | W2 |
| 15 | Validación jurídica | Los perfiles (32 h PART, 48 h FULL, descanso de 12 h) son requisitos de producto **sin validación jurídica** (AH2-004). El estado «VALIDADO» de la UI se refiere al perfil configurado. | Distinguir explícitamente la validez técnica de la jurídica en datos, UI y PDF. | Alta | B1, U1 |
| 16 | Fuente de demanda | Solo el PDF de POM. | Abstraer la fuente. | Media | B4 |
| 17 | Copia local | localStorage como respaldo por dispositivo. | Caché con detección de conflictos; **nada oficial** sin servidor. | Media | P2 |
| 18 | Proyecto compartido | Supabase compartido con Prestify (MASTER §5, sin reverificar desde el 12/11). En el sitio `al-iada` están desplegadas `create-payment` y `webhook-mp` (VERIFICADO, deploy `6af8ee2d`). | Aislar los productos antes de comercializar. | **Bloqueante para comercializar** | D13 |

**Qué se conserva:**
- motor de tres pasadas con multi-arranque y respaldo;
- validador independiente;
- contrato de horas único;
- recálculo tras editar;
- trazabilidad `generacion`;
- PDF operativo;
- carga desde el PDF de POM;
- modelo de reglas v2;
- aprendizaje como sesgo blando.

## 2. Diseño técnico por componentes

| Componente | Responsabilidad | Módulo | Persistencia |
|---|---|---|---|
| Configuración de sucursal | Colaboradores, contratos, reglas v2, ciclos y políticas con herencia y origen visible | `src/configuracion/` | Almacén actual → tablas P1/P5 |
| Fuente de demanda | `MatrizDemanda` normalizada con huella | `src/demanda/` | jsonb → `demandas` |
| Planificación | Motor central y parámetros de la sucursal; candidatos de continuidad y rotación en el tramo C | `src/algoritmo/`, `src/utils/generacionMultiArranque.ts` | — |
| Validación técnica | Única compuerta; en el cliente para dar respuesta inmediata y en el servidor para lo oficial | `src/algoritmo/validadorIndependiente.ts` | — |
| Perfiles normativos | Perfil versionado con su **estado jurídico** y sus fuentes | `src/algoritmo/contratos.ts` (extensión) | → `perfiles_normativos` |
| Flujo de planificación | Estados, intervalos de vigencia, reemplazo parcial, diff y huellas | `src/planificacion/` (puro) | jsonb (solo prueba local) → `versiones_horario`, `tramos_vigencia` |
| Publicación oficial | Permisos, revalidación y transacción | Netlify Function `publicar` + RPC `publicar_version` | Tablas P2 |
| Contingencias | Ausencias, disponibilidad efectiva y replanificación parcial | `src/contingencias/` (puro) | → `ausencias` |
| Memoria de la sucursal | Registro de ciclo, modificaciones y preferencias | `src/memoria/` (puro) | → tablas P4 |
| Auditoría | Eventos que solo se agregan | `src/auditoria/` | → `eventos_auditoria` |
| Ejecución en segundo plano | Web Worker cancelable con corte por trabajo | `src/workers/` | — |

## 3. Modelo de datos propuesto

### 3.1 Entidades

```text
Empresa 1─* Región 1─* Sucursal 1─* Colaborador 1─* Contrato (vigencia)
                          ├─* ReglaV2 · CicloPlanificacion · Demanda (snapshot)
                          ├─* VersionHorario ─* EventoFlujo (inmutable)
                          ├─* Publicacion 1─* TramoVigencia  (intervalo de días [desde, hasta] → versión)
                          ├─* Ausencia · AutorizacionHorasSuplementarias
                          └─* RegistroCiclo ─* Modificacion · PreferenciaSucursal
PerfilNormativo (empresa/convenio, versión, estado jurídico, fuentes)
Usuario *─* Membresia (ámbito empresa | región | sucursal, rol)
EventoAuditoria (solo agregado)
```

### 3.2 Tipos principales (TypeScript, PROPUESTO)

```ts
type Id = string                       // UUID; colaboradores con id estable (ID-01, #9), nunca el nombre
type Fecha = string                    // YYYY-MM-DD, interpretada en la zona horaria de la sucursal

interface Empresa { id: Id; nombre: string; zonaHorariaPorDefecto: string }
interface Region { id: Id; empresaId: Id; nombre: string }
interface Sucursal { id: Id; empresaId: Id; regionId: Id | null; codigo: string; nombre: string; zonaHoraria: string }

type Rol = 'admin-empresa' | 'director-regional' | 'supervisor' | 'aprobador' | 'auditor'
interface Membresia { usuarioId: Id; rol: Rol; ambito: { tipo: 'empresa' | 'region' | 'sucursal'; id: Id }; desde: Fecha; hasta?: Fecha }

interface PoliticasPlanificacion {
  modalidad: 'semanal' | 'mensual'
  coberturaObjetivoPct: number                     // AH2-017 (091: 95)
  franjasPico: { criterio: 'max-del-dia' | 'umbral'; umbral?: number } // §6.2; por defecto 'max-del-dia'
  continuidad: { toleranciaCoberturaPp: number }   // 0 hasta calibrar con benchmark (D9)
  horarioOperativo: { desde: string; hasta: string }
  aprobacionPropiaPermitida: boolean               // D3
  horasSuplementarias: { habilitada: boolean }     // AH2-024; por defecto false
}

interface CicloPlanificacion {
  id: Id; sucursalId: Id; nombre: string; modalidad: 'semanal' | 'mensual'
  inicio: Fecha; fin: Fecha                        // explícitos (AH2-016); lunes a domingo (D2)
  estado: 'planificado' | 'abierto' | 'cerrado'; origen: 'sucursal' | 'calendario-empresa'
}

// §5.6 · Perfil normativo con estado JURÍDICO separado de la validación técnica.
interface PerfilNormativo {
  id: string                                       // p. ej. 'horas-2026-11-part32'
  empresaId: Id; convenio?: string; vigenteDesde: Fecha
  parametros: unknown                              // topes, descansos, francos, cortados
  estadoJuridico: 'requisito-producto' | 'en-revision' | 'validado-juridicamente' | 'rechazado'
  fuentes: Array<{ tipo: 'ley' | 'convenio' | 'contrato' | 'dictamen'; referencia: string; verificadoPor?: Id; en?: Fecha }>
}

type EstadoVersion =
  | 'BORRADOR' | 'VALIDADO' | 'APROBADO'           // pueden existir como PRUEBA LOCAL o en el servidor
  | 'PUBLICADO'                                    // SOLO oficial (servidor)
  | 'REEMPLAZADO_TOTAL' | 'DESCARTADO'             // históricos
interface VersionHorario {
  id: Id; sucursalId: Id; cicloId: Id; fechaLunes: Fecha; numero: number
  ambito: 'prueba-local' | 'servidor'              // §5.1: «prueba-local» nunca llega a PUBLICADO
  estado: EstadoVersion
  origen: 'generacion' | 'edicion' | 'replanificacion' | 'continuidad'
  basadaEn?: Id; replanificaDesde?: Fecha          // reemplazo parcial (§5.4)
  horario: unknown                                 // ResultadoAsignacion
  generacion: RegistroGeneracion                   // ya existe; v3 suma el registro de búsqueda (§10.5)
  huellas: { demanda: string; reglas: string; roster: string; contratos: string; configOperativa: string; ausencias: string; perfilNormativoId: string }
  validacionTecnica?: { estado: 'VALIDADO' | 'BORRADOR' | 'SIN VERIFICAR'; huellaValidada: string; en: string; validadorVersion: string; donde: 'cliente' | 'servidor' }
  // La versión NO guarda su vigencia: la vigencia vive en TramoVigencia (§5.4).
}
interface EventoFlujo { versionId: Id; de: EstadoVersion | null; a: EstadoVersion; actorId: Id; rol: Rol; en: string; motivo?: string; resumenValidacion: string; donde: 'cliente' | 'servidor' }

// §5.4 · Vigencia por intervalos efectivos de días.
interface Publicacion { id: Id; sucursalId: Id; cicloId: Id; publicadaPor: Id; publicadaEn: string; motivo?: string; reemplazaPublicacionIds: Id[] }
interface TramoVigencia {
  id: Id; sucursalId: Id; publicacionId: Id; versionId: Id
  desde: Fecha; hasta: Fecha                       // intervalo cerrado [desde, hasta]
  recortadoPor?: Id                                // publicación que lo recortó o anuló (evento; nunca se borra)
  hastaEfectivo: Fecha | null                      // = hasta, o el día anterior al reemplazo; null = anulado antes de empezar
}

interface Ausencia {
  id: Id; sucursalId: Id; colaboradorId: Id
  tipo: 'vacaciones' | 'licencia' | 'accidente' | 'indisponibilidad' | 'otra'   // sin diagnósticos
  desde: Fecha; hasta: Fecha | null; alcance: 'dia-completo' | { desde: string; hasta: string }
  estado: 'registrada' | 'confirmada' | 'anulada'; registradaPor: Id; registradaEn: string
}

interface AutorizacionHorasSuplementarias {
  id: Id; sucursalId: Id; colaboradorId: Id; desde: Fecha; hasta: Fecha; horasAdicionalesMaxSemana: number
  motivo: { tipo: 'ausencia-prolongada' | 'contingencia' | 'otro'; ausenciaId?: Id; detalle: string }
  validacionNormativa: { estado: 'pendiente' | 'validada' | 'rechazada'; fuente?: string; porId?: Id; en?: Fecha }
  solicitadaPor: Id; autorizadaPor?: Id; estado: 'solicitada' | 'autorizada' | 'revocada' | 'vencida'
}

interface Modificacion {
  id: Id; versionId: Id; colaboradorId: Id; fecha: Fecha; antes: unknown; despues: unknown
  motivo: { codigo: string; detalle?: string }     // catálogo (D11)
  clasificacion: 'preferencia-recurrente' | 'excepcion-temporal' | 'correccion-operativa' | 'contingencia'
  autorId: Id; en: string
}
interface RegistroCiclo {
  sucursalId: Id; cicloId: Id; publicacionIds: Id[]
  generadoInicial: { versionId: Id; estrategia: string; cobertura: number; busquedaCompleta: boolean }
  aprobadoFinal: { versionId: Id; cobertura: number; faltantesH: number; sobrantesH: number; faltantesPicoH: number }
  modificaciones: number; cambiosFrenteAlVigente: number
  equidad: Record<Id, EquidadColaborador>          // §6.4
  horasSuplementariasUsadas: number
}
interface PreferenciaSucursal {
  id: Id; sucursalId: Id; colaboradorId: Id; tipo: string; parametros: Record<string, unknown>
  evidencia: { modificacionIds: Id[]; ciclos: number }
  estado: 'propuesta' | 'confirmada' | 'retirada' | 'vencida'; confirmadaPor?: Id; venceEn?: Fecha
  nivel: 'PREFERENCIA'                             // invariante: nunca NORMATIVA ni OPERATIVA
}
```

### 3.3 Persistencia en dos etapas

- **Etapa 1 — prueba local** (sin migración, 091, bandera):
  - el flujo de revisión (BORRADOR, VALIDADO y APROBADO locales) viaja en el jsonb `horario_completo` existente con `ambito: 'prueba-local'`;
  - sirve para probar la experiencia y el dominio;
  - **no produce publicaciones oficiales ni vigencia** (§5.1).
- **Etapa 2 — oficial** (migración autorizada, P1/P2):
  - tablas `empresas`, `regiones`, `sucursales`, `membresias`, `perfiles_normativos`, `versiones_horario`, `publicaciones`, `tramos_vigencia` (con restricción de exclusión, §5.4), `eventos_auditoria`, `ausencias`, `autorizaciones_horas_suplementarias`, `registros_ciclo`, `modificaciones`, `preferencias_sucursal` y `reglas_v2`;
  - copia idempotente desde `semanas_historial` sin borrarla;
  - SQL en un PR propio, no aplicado sin autorización.

## 4. Ciclos de planificación

- **REQUISITO:** modalidad semanal o mensual por sucursal; ciclos explícitos con identificador, inicio y fin; ciclos mensuales de 4 o 5 semanas según su vigencia real; rotación entre ciclos y estabilidad dentro del ciclo.
- **Validación de la configuración:**
  - inicio en lunes y fin en domingo (D2);
  - 1 semana (semanal) o 4–5 semanas (mensual);
  - sin superposiciones;
  - sin huecos desde el primer ciclo activo;
  - un ciclo con publicaciones no se borra: se cierra.

  Si la configuración es inválida, se bloquea la publicación oficial con un mensaje claro.
- **Calendario:** la empresa puede proponerlo (D7); cada sucursal lo confirma y el ciclo queda explícito (AH2-016).
- **Funciones puras:** `cicloDe(fecha)`, `esPrimeraSemanaDelCiclo(lunes)`, `semanasDelCiclo(ciclo)` y `validarCalendario(ciclos)`.
- **Mensual:** al publicar el ciclo, el patrón se materializa en una versión por semana real, con las excepciones y ausencias de cada semana. Cada semana genera su `TramoVigencia` dentro de la misma `Publicacion`. Un POM nuevo dentro del ciclo se compara, pero no cambia lo publicado salvo una replanificación aprobada.

## 5. Aprobación, publicación oficial y versionado

### 5.1 Dos ámbitos: prueba local y oficial (corrección 1)

| | **Prueba local** | **Oficial** |
|---|---|---|
| Dónde vive | jsonb y localStorage del usuario actual | Tablas en el servidor (P2) |
| Estados posibles | BORRADOR, VALIDADO, APROBADO, todos marcados «prueba local» | BORRADOR → VALIDADO → APROBADO → **PUBLICADO**, más históricos |
| Identidad y permisos | Los de hoy (usuario de la sesión) | Membresía y rol verificados por las políticas de acceso y la RPC |
| Validación | En el cliente | En el cliente para dar respuesta inmediata, y **en el servidor** como requisito |
| Vigencia | **Ninguna.** Nunca define «el horario vigente». | Tramos de vigencia transaccionales |
| PDF | Leyenda fija «PRUEBA LOCAL — NO OFICIAL» | «PUBLICADO vN · aprobado por … el … · validado técnicamente contra el perfil X (estado jurídico: …)» |
| Uso | Probar la experiencia y el dominio en la 091 sin migración | Operación real |

Regla dura (**I0**): **no existe camino para que un JSON local, un cliente modificado o un proceso sin membresía produzca un estado PUBLICADO.** El único escritor de `PUBLICADO` y de `tramos_vigencia` es la RPC transaccional `publicar_version`, invocada por la Function `publicar` después de revalidar.

### 5.2 Estados y transiciones (oficial)

```text
generar/editar/replanificar
        │
        ▼
    BORRADOR ──validación técnica OK──► VALIDADO ──aprobar──► APROBADO ──publicar (servidor)──► PUBLICADO (crea tramos)
        ▲                                   │                    │
        └── cualquier cambio de horario o de sus huellas: «validación caducada» ─┘
    DESCARTADO ◄── descartar (BORRADOR / VALIDADO / APROBADO)
    REEMPLAZADO_TOTAL ◄── todos sus tramos fueron recortados antes de empezar
```

| Transición | Roles | Precondiciones |
|---|---|---|
| → BORRADOR | supervisor | Ninguna (AH2-008). |
| BORRADOR → VALIDADO | sistema (validador) | 0 violaciones y sin limitaciones de datos. **Es validez técnica, no jurídica** (§5.6). |
| VALIDADO → APROBADO | aprobador; el supervisor solo si `aprobacionPropiaPermitida` (D3) | Huella vigente. Ciclo válido. |
| APROBADO → PUBLICADO | aprobador, director regional o admin de empresa, **solo por el servidor** | Function `publicar`:<br>1. verifica el JWT y la membresía;<br>2. **revalida** con el mismo validador versionado;<br>3. comprueba que las huellas coincidan;<br>4. llama mediante credenciales exclusivas del servidor a la operación SQL privada/restringida `publicar_version` (según la vía elegida en §10.4); esa operación comprueba de nuevo actor humano y membresía/rol, bloquea la sucursal, verifica estado, huellas y numeración esperada (control optimista), crea `Publicacion` y `TramoVigencia`, recorta los tramos anteriores (§5.4) y registra los eventos;<br>5. la restricción de exclusión garantiza que no haya solapamientos (I1). |
| Editar un PUBLICADO | — | Prohibido. Se crea una versión nueva (`basadaEn`, `replanificaDesde`). |
| Agente o proceso automático | — | Prohibido (I8). |

### 5.3 Invariantes

| ID | Invariante |
|---|---|
| I0 | Solo el servidor (RPC `publicar_version` tras la Function `publicar`) escribe PUBLICADO y tramos de vigencia. La prueba local nunca es oficial. |
| I1 | **Para cada (sucursal, fecha) hay como máximo un tramo efectivo.** Se garantiza en la base, también bajo concurrencia (§5.4). |
| I2 | Solo se publica lo VALIDADO **en el servidor** (huella vigente) y aprobado por una persona con rol. |
| I3 | Lo publicado es inmutable. Un reemplazo **recorta** tramos mediante eventos y nunca edita la versión. |
| I4 | Ninguna jornada transcurrida cambia: un reemplazo empieza como mínimo el día siguiente a hoy, en la zona horaria de la sucursal (D14). |
| I5 | Equidad, continuidad y aprendizaje usan el **historial efectivo por fecha** (§6.4). Los borradores y la prueba local nunca cuentan. |
| I6 | El cambio de ciclo solo surge de `CicloPlanificacion`. |
| I7 | Todo registro tiene `empresaId` y `sucursalId`, y las políticas de acceso de membresía lo protegen. |
| I8 | Ningún agente aprueba ni publica. |
| I9 | Reproducibilidad: huellas, versión del algoritmo, versión del validador y registro de búsqueda (§10.5). |
| I10 | El PDF muestra el ámbito, el estado real y el estado jurídico del perfil (§5.6). |
| I11 | Lo aprendido solo produce PREFERENCIAS y parámetros blandos (AH2-025). |
| I12 | Las horas suplementarias exigen política de la sucursal, autorización vigente y validación normativa (AH2-024). |
| I13 | Nunca se dice ni se muestra «cumple la ley», «legal» ni equivalentes, salvo que el perfil esté en `validado-juridicamente` con fuentes registradas (§5.6). |

### 5.4 Vigencia parcial por intervalos y concurrencia (corrección 2)

**Modelo:** la vigencia **no es un atributo de la versión**. La forman los `TramoVigencia` (intervalos cerrados de días) que crea cada publicación.

```text
Publicación P1 (lunes 16): tramo T1 = versión V1, [lun 16, dom 22]
Ausencia confirmada el martes 17 para el miércoles 18 → replanificación desde mié 18 → versión V2 (lun–mar idénticos a V1)
Publicación P2 (martes 17): tramo T2 = versión V2, [mié 18, dom 22]
                            T1 recortado: hastaEfectivo = mar 17   (evento «recortado por P2»; T1 no se borra)

Efectivo:  lun 16 → V1 · mar 17 → V1 · mié 18…dom 22 → V2
```

**Reglas:**
- **Recorte, nunca reescritura.** Un reemplazo desde `F`:
  - recorta los tramos que se solapan con [F, …]: `hastaEfectivo = F − 1`;
  - si el tramo todavía no había empezado, se anula (`hastaEfectivo = null`);
  - la versión anterior y sus días anteriores a `F` quedan intactos.
- **`F` ≥ mañana** en la zona horaria de la sucursal (I4). Replanificar el día en curso queda como decisión D14.
- **La versión del reemplazo debe ser idéntica en los días anteriores a `F`** a la versión vigente (jornadas fijas). La Function lo verifica antes de publicar; el validador revisa la semana completa, incluido el descanso de 12 h entre el último día congelado y `F`.

**Unicidad garantizada en la base**, aun con dos aprobadores publicando a la vez:

```sql
-- PROPUESTO (P2), no aplicado. Requiere la extensión btree_gist, incluida en Supabase sin costo.
alter table tramos_vigencia add constraint sin_solapamiento
  exclude using gist (sucursal_id with =, daterange(desde, hasta_efectivo, '[]') with &&)
  where (hasta_efectivo is not null);
```

- **Transacción de `publicar_version`:**
  1. `pg_advisory_xact_lock` por sucursal;
  2. relee tramos efectivos;
  3. comprueba la numeración esperada (control optimista);
  4. recorta;
  5. inserta.

  Si dos publicaciones compiten, una gana y la otra recibe un **conflicto explícito** («otra publicación cambió la vigencia; revisá y volvé a publicar»). La restricción de exclusión es la última barrera ante cualquier error de lógica.
- **Funciones puras (`src/planificacion/vigencia.ts`):**
  - `tramoEfectivoEn(tramos, fecha)`;
  - `aplicarReemplazo(tramos, nuevaPublicacion, F)`, que devuelve tramos nuevos y recortes;
  - `verificarSinSolapamientos(tramos)`.

  Las mismas reglas que la base, para la UI y las pruebas.

### 5.5 Comparación entre versiones

`diffHorarios(a, b, rangoFechas?)` mide:
- personas afectadas;
- francos movidos;
- cambios de tipo de turno;
- desvío de horario en minutos (un ajuste de 30 min no es un cambio de turno);
- horas por persona;
- cobertura y faltantes, totales y **en picos**.

Admite un rango para mostrar solo el tramo replanificado.

### 5.6 Validación técnica y validación jurídica (corrección 5)

| | Validación técnica del horario | Validación jurídica del perfil |
|---|---|---|
| Qué responde | ¿El horario cumple **el perfil configurado** y las reglas vigentes? | ¿El **perfil** (32 h PART, 48 h FULL, 12 h de descanso, franco y medio, cortes) se ajusta a la ley, el convenio y el contrato aplicables? |
| Quién la hace | El validador independiente, automático, en el cliente y en el servidor | Una persona con competencia jurídica o laboral, que registra sus fuentes |
| Dónde se registra | `VersionHorario.validacionTecnica` | `PerfilNormativo.estadoJuridico` y `fuentes` |
| Estados | VALIDADO / BORRADOR / SIN VERIFICAR | requisito-producto / en-revisión / validado-jurídicamente / rechazado |
| Cómo se muestra | «Validado técnicamente contra el perfil `horas-2026-11-part32`» | «Estado jurídico del perfil: requisito de producto, sin validación jurídica» (situación actual, AH2-004) |

- Ningún estado, texto, PDF ni reporte dice «legal», «cumple la normativa» ni equivalentes mientras el perfil no esté `validado-juridicamente` con fuentes verificadas (I13).
- Publicar oficialmente con un perfil no validado jurídicamente es una decisión del propietario (**D5**) y, si se autoriza, el PDF lo declara.

## 6. Continuidad y rotación entre ciclos

### 6.1 Orden de prioridades (lexicográfico)

1. Reglas obligatorias y disponibilidad.
2. Horas contractuales exigibles (AH2-020).
3. Cobertura: el objetivo de la sucursal (091: **95 %**) y las **franjas pico protegidas**.
4. Estabilidad dentro del ciclo, o rotación en la primera semana de un ciclo nuevo.
5. Sobrantes y preferencias.

### 6.2 Candidatos y selección sin sacrificar cobertura (corrección 4)

Los candidatos se agregan al multi-arranque existente (tramo C) mediante `semillas`:
- `mantener-vigente`: el horario vigente reaplicado;
- `continuidad`: sembrado con el vigente;
- `rotacion`: solo en la primera semana del ciclo.

**Selección:**
1. **Elegibles:** validados técnicamente, sin violaciones nuevas, sin bajar horas de nadie (AH2-020).
2. **`mejor`:** el elegible de mayor cobertura total. Desempata el menor déficit en picos.
3. Un elegible es **aceptable** solo si cumple **todo** lo siguiente:
   - **Objetivo mínimo:** si `mejor` alcanza el objetivo (≥ 95 % en la 091), el aceptable también. Si `mejor` no lo alcanza, solo es aceptable una cobertura **igual** a la de `mejor`: con tolerancia 0, la continuidad nunca cede cobertura cuando ya se está por debajo del objetivo.
   - **Tolerancia:** `cobertura ≥ mejor − toleranciaCoberturaPp`. **La tolerancia es 0 hasta que el propietario la apruebe a partir de un benchmark (D9).** Mientras tanto, la continuidad solo **desempata** entre soluciones de igual cobertura.
   - **Picos protegidos:** en cada franja pico, el déficit del aceptable es menor o igual que el de `mejor` en esa franja. Una franja pico es, por defecto, la de mayor demanda del día; puede configurarse por umbral. Nunca se traslada déficit a un pico para ganar estabilidad, aunque el total sea igual.
4. Entre los aceptables:
   - dentro del ciclo, el de menos cambios (personas afectadas, francos, tipo de turno);
   - en la primera semana del ciclo, el de mayor mejora de equidad.
5. Empate: el respaldo.

**Explicación obligatoria:** si se eligió un candidato distinto del de mayor cobertura, la UI y el registro dicen cuánta cobertura se cedió (siempre 0 hasta D9), por qué, y que ningún pico empeoró.

### 6.3 Variación de la demanda

`compararDemanda(anterior, nueva)` calcula, con las matrices alineadas por día y franja:
- Δ de horas-caja total y por día;
- franjas con |Δ| ≥ 1;
- cambios en picos;
- **cobertura proyectada del horario vigente sobre el POM nuevo**, total y en picos.

Clasificación inicial, con umbrales configurables y calibrados por benchmark:
- **estable:** el vigente cumple el objetivo y no deja picos nuevos sin cubrir;
- **moderada:** se ajusta lo necesario;
- **importante:** se permiten cambios mayores, con explicación.

### 6.4 Historial efectivo y equidad (corrección 3)

**Definición:**

`historialEfectivo(sucursal, desde, hasta)` = para **cada fecha** del rango, la jornada de cada colaborador según la **versión cuyo tramo estaba efectivo en esa fecha**, resuelta con `tramoEfectivoEn` y considerando todos los recortes.

- Si V1 rigió lunes y martes y V2 rigió de miércoles a domingo, el lunes y el martes se toman de V1 (aunque V1 haya sido reemplazada después) y el resto de V2.
- **Nunca cuentan:**
  - borradores, versiones validadas o aprobadas no publicadas;
  - prueba local;
  - versiones descartadas;
  - fechas futuras;
  - días de un tramo anulado antes de empezar.
- **Planificado vigente ≠ trabajado.** El historial efectivo es lo **planificado y vigente** en cada fecha, no la asistencia real, que está fuera de alcance (#44).
  - Las **ausencias confirmadas** de la fecha se descuentan: ese día no suma mañana, cierre ni fin de semana trabajado.
  - Nunca se presenta como «trabajo efectivamente realizado».
- **Semanas legadas** (anteriores a P2): no tienen tramos. Para la rotación pueden usarse en forma transitoria como «legado presunto», solo la última versión por lunes y con esa etiqueta, hasta acumular 4 semanas oficiales (D4). Nunca se muestran como publicadas.

**Equidad** por colaborador, normalizada por **días efectivamente planificados**, excluidos ausencias y francos:
- proporción de mañanas, tardes y cierres;
- fines de semana trabajados;
- francos en fin de semana.

Las reglas de turno fijo excluyen a esa persona de la rotación de ese turno.

## 7. Ausencias y replanificación parcial

- **Registro:** `Ausencia` sin diagnósticos; registrada, confirmada o anulada; auditada. La persona sigue en la nómina.
- **Disponibilidad efectiva** (puro): roster − ausencias confirmadas − reglas. Se traduce a excepciones que el motor ya entiende, así que no cambia el motor para semanas futuras.
- **Replanificación parcial** sobre un horario oficial, desde `F` ≥ mañana:
  1. se congelan como jornadas fijas los días anteriores a `F` (tramo D);
  2. se optimiza desde `F` con los candidatos de continuidad (§6.2);
  3. se valida la semana completa;
  4. se muestra el diff del rango;
  5. pasa por aprobación;
  6. la publicación oficial en el servidor **recorta** el tramo anterior desde `F` (§5.4).
- **Orden de recursos** (AH2-024):
  1. dotación habitual dentro de sus contratos;
  2. AUX;
  3. eventuales;
  4. déficit informado;
  5. solo de forma excepcional y autorizada, horas suplementarias PART (§8).
- **Regreso:** al vencer `hasta`, la persona vuelve a ser asignable en la siguiente planificación o replanificación, sin tocar lo publicado.

## 8. Política de horas PART y horas suplementarias (capacidad futura)

**REQUISITO (AH2-024):**
- objetivo habitual de 32 h;
- primero la dotación habitual, después AUX y eventuales;
- las horas suplementarias son un recurso excepcional, con autorización y validación legal y convencional;
- nunca se asignan automáticamente ni pasan a ser el objetivo habitual.

**Hoy:** el motor no las asigna (tope = min(ficha, perfil)) y no cambia en este tramo.

**Diseño S1 (PROPUESTO):**
- **Autorización** por persona y período, con motivo, horas máximas por semana, validación normativa con fuente, quién solicitó y quién autorizó.
- **Uso** solo si se cumplen las tres condiciones a la vez (política de la sucursal, autorización vigente, validación normativa `validada`) **y** queda déficit después de dotación, AUX y eventuales.
- **Motor:** pasada 4 sobre el déficit residual; el objetivo de 32 h de la pasada 1 no cambia.
- **Validador:** controla contra el tope efectivo.
- **Visibilidad:** métrica, aviso al aprobar y marca en el PDF.

## 9. Aprendizaje independiente por sucursal

**REQUISITO (AH2-025):** cada sucursal aprende de su propio historial. Lo aprendido nunca modifica restricciones legales ni reglas obligatorias, y no se entrenan modelos sin necesidad.

**Diseño:** un motor compartido y una **memoria por sucursal**:
1. **Registro de ciclo**, construido sobre el historial efectivo (§6.4).
   - Sus métricas de búsqueda incluyen `busquedaCompleta` (§10.5): un ciclo con búsqueda interrumpida se distingue al analizar resultados.
2. **Modificaciones** con motivo y clasificación:
   - **temporal y contingencia:** no se aprenden;
   - **operativa:** alimenta métricas;
   - **recurrente:** puede generar una preferencia **propuesta** si se repite N veces en 2 o más ciclos.
3. **Preferencias:** una persona las confirma; son siempre de nivel PREFERENCIA y vencen.
4. **Parámetros blandos:**
   - pesos de franja;
   - umbrales;
   - orden de estrategias (el respaldo nunca se quita).
   - La **tolerancia de continuidad no se aprende**: la fija el propietario (D9).

**Salvaguardas:**
- el tipo de dato admite solo nivel PREFERENCIA;
- lo aprendido entra solo como sesgo blando;
- una preferencia en conflicto con una regla obligatoria se descarta;
- el validador no lee la memoria;
- todo es explicable, reversible y auditado.

**Fuera de alcance:** compartir patrones agregados entre sucursales, salvo decisión explícita (opt-in).

## 10. Plataforma para 160 sucursales

### 10.1 Organización y roles (REQUISITO AH2-026)

| Rol | Ámbito | Puede |
|---|---|---|
| admin-empresa | empresa | Políticas, calendario, perfiles normativos (registro de fuentes), regiones, sucursales, membresías; publicar; auditar. |
| director-regional | región | Ver sus sucursales; aprobar y publicar si la política lo permite; comparar indicadores. |
| aprobador | sucursal | Aprobar y publicar; confirmar ausencias. |
| supervisor | una o varias sucursales | Cargar demanda, generar, editar, enviar a aprobación, registrar ausencias, confirmar preferencias; aprobar solo si `aprobacionPropiaPermitida`. |
| auditor | empresa o región | Solo lectura, incluida la auditoría. |

Un usuario puede tener varias membresías y una sucursal puede tener varios supervisores. La sucursal activa sale de las membresías.

### 10.2 Aislamiento verificable

- **Función** `aliada.tiene_acceso(p_sucursal uuid, p_roles text[])`: `security definer` con `search_path` fijo; resuelve la membresía directa, por región o por empresa.
- **Políticas por tabla.** `eventos_auditoria` no admite UPDATE ni DELETE. `tramos_vigencia` y el estado `PUBLICADO` **no se escriben directamente**: solo mediante la RPC (`revoke` sobre insert y update para los roles del cliente).
- **Pruebas automatizadas de las políticas:**
  - sobre Supabase local (CLI gratuita) en CI;
  - escenario de 2 empresas, 2 regiones, 4 sucursales y todos los roles;
  - casos positivos y negativos por tabla y rol;
  - intento de escribir `PUBLICADO` o tramos sin RPC → rechazado;
  - publicación concurrente → un conflicto.
  - Estas pruebas son el **criterio de aceptación de P1 y P2**.
- **Proyecto compartido con Prestify:** decisión D13. Este tramo no lo modifica.

### 10.3 Configuración y reglas con vigencia

- Reglas v2 con ámbito empresa, región, sucursal, grupo o persona, con vigencia, nivel y auditoría.
- La empresa define valores por defecto (por ejemplo, el perfil normativo del convenio) y la sucursal sobrescribe lo operativo.
- Las reglas normativas no se relajan.
- La UI muestra el valor efectivo y su origen.

### 10.4 Publicación oficial en el servidor (corrección 1; revisión de seguridad P2)

Ver §5.2 y §5.4 y `docs/proposals/AH2_P2_RPC_PUBLICACION_SEGURA.md` (PR #47). **Corrección de la v3:** verificar el JWT del usuario **no implica** invocar `publicar_version` con ese mismo JWT. Si `authenticated` puede ejecutar la RPC por PostgREST, un cliente puede llamarla directamente y eludir la revalidación de la Function.

**Flujo obligatorio:**
1. La Netlify Function `publicar` verifica el JWT con Supabase Auth, obtiene la identidad real y verifica la membresía y el rol de la sucursal.
2. Lee los datos persistidos con autorización verificada, vuelve a ejecutar el validador TypeScript versionado y **recalcula** la huella; no confía en una huella enviada por el navegador.
3. Solo después llama a una operación transaccional de base mediante credenciales **exclusivas del servidor**, nunca presentes en el bundle ni expuestas al cliente.
4. La operación SQL revalida en la misma transacción el actor humano recibido, su membresía/rol, estado APROBADO, huellas, revisión optimista, fecha mínima de reemplazo y días congelados; toma el bloqueo por sucursal, recorta/inserta los tramos y registra eventos. La restricción de exclusión impide solapamientos aun bajo concurrencia.

**Dos rutas técnicas válidas para P2 (no implementar aquí):**
- **RPC en esquema privado no expuesto por PostgREST:** la Function debe usar **conexión SQL directa** y segura (pooler/cliente PostgreSQL del lado servidor) para ejecutarla. Una llamada `supabase.rpc(...)` a través de PostgREST **no puede** alcanzar una función de un esquema no expuesto.
- **RPC accesible mediante PostgREST, pero no ejecutable por clientes:** ubicar la RPC en un esquema expuesto y aplicar `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`; conceder ejecución solo a un rol de servicio usado por la Function. La ruta HTTP puede existir, pero cualquier JWT ordinario, incluso de un aprobador, debe recibir rechazo. La RPC comprueba nuevamente el actor humano y permisos, porque un rol de servicio puede omitir RLS.

La elección entre ambas requiere verificar permisos y conexiones en P0 y probar el diseño en Supabase local antes de P2. En ambos casos: `SECURITY DEFINER` con `search_path` restringido cuando corresponda, mínimos privilegios, secretos solo en variables de servidor sin prefijo `VITE_`, y pruebas negativas de llamada directa, membresía y concurrencia. No afirmar que el uso de una clave de servicio conserva automáticamente RLS: la autorización debe verificarse explícitamente en la Function y en SQL.

- **Costo:** reutilizar Supabase y Netlify actuales; verificar límites efectivos y conectividad en P0 antes de afirmar capacidad para 160 sucursales.
- Si la Function, la revalidación o la base no están disponibles, **no se publica**. No hay modo degradado oficial.

### 10.5 Generación escalable y reproducible (corrección 8)

**Web Worker (W1):**
- la interfaz nunca se bloquea;
- botón Cancelar;
- si no hay soporte, se cae al hilo principal con el mismo cálculo;
- prueba de equivalencia.

**Corte por trabajo (W2), definición reproducible:**
- **Unidades de trabajo deterministas.** Se cuentan las evaluaciones de la DP por colaborador y por pasada en la pasada 1, y las estrategias completadas en el multi-arranque. El presupuesto se expresa en unidades: `maxPasadas`, `maxEvaluaciones` y la lista de estrategias. **Ninguna decisión de la búsqueda depende del reloj.**
- **Orden estable:** los colaboradores se recorren en orden fijo por id estable, las estrategias en el orden declarado y los desempates son explícitos. No hay iteración dependiente de inserción ni aleatoriedad (hoy no se usa `Math.random`, verificado).
- **Límite de seguridad por tiempo:** solo como guardia ante algo patológico, por ejemplo 60 s, configurable. Si se dispara:
  - la búsqueda se **interrumpe y queda registrada**: `busqueda.completa = false`, motivo `limite-seguridad`, unidades consumidas y estrategias o pasadas no completadas;
  - el resultado **no se presenta como búsqueda completa**: aviso en la UI («búsqueda interrumpida por límite de seguridad; el resultado puede no ser el mejor que el motor encuentra en un equipo más rápido») y en el registro del ciclo;
  - se puede publicar si el validador lo aprueba (la validez técnica no depende de la completitud), pero el aviso queda en la versión y en el PDF (D12).
- **Registro en `generacion`:** `busqueda { modo: 'por-trabajo', presupuesto, consumido, completa, motivoInterrupcion?, estrategiasOmitidas[] }`. Hoy la pasada 1 corta a los 6 s **sin registrarlo**: W2 corrige esa omisión.
- **Pruebas de reproducibilidad:**
  - misma entrada → `JSON` idéntico (jornadas, métricas y registro) en Node, Chromium a 1× y Chromium a 6×;
  - 200 escenarios sin interrupción;
  - una prueba fuerza el límite de seguridad y verifica `completa = false` y el aviso.
- **Diferencia esperada frente al corte por tiempo:** se documenta con el benchmark de 200 escenarios (cobertura, horas y violaciones) antes de aprobar W2. Cambia `versionAlgoritmo`.

### 10.6 Volumen, rendimiento y caché

- **Filas:** unas 25 000 versiones por año (160 × 52 × ~3), entre 1,2 y 3,7 GB por año.
- **Mitigación:**
  - columnas indexadas para los listados;
  - archivar las versiones descartadas después de 12 meses (D6), conservando siempre las publicadas y sus tramos.
- **Copia local:** caché de lectura y cola de borradores con detección de conflictos. Aprobar en el servidor y publicar requieren conexión.

### 10.7 Independencia de POM

- `MatrizDemanda` normalizada con horario operativo por sucursal.
- Adaptadores `pom-pdf`, `manual` y `api` futuro, con credenciales solo en el servidor.
- Cada importación guarda fuente y huella.

### 10.8 Despliegue gradual

- La bandera de prueba local se activa por sucursal. La **publicación oficial** se habilita por sucursal **solo después de P1, P2 y O1**: primero la 091, después por región.
- Indicadores para avanzar de ola:
  - publicaciones en término;
  - 100 % validadas técnicamente en el servidor;
  - reemplazos parciales por semana;
  - cobertura y picos frente al objetivo;
  - cambios frente al vigente;
  - búsquedas interrumpidas (deberían ser 0);
  - modificaciones manuales por ciclo, que deben bajar.

## 11. Evidencia del primer horario real (semana 47)

Métricas **agregadas informadas por el propietario**. No se reproducen desde el repositorio porque los datos reales no están en GitHub.

| Métrica | Valor |
|---|---|
| Demanda POM | 406 horas-caja |
| Cobertura Aliada | 99,14 % |
| Faltantes | 3,5 horas-caja |
| Sobrantes | 0,5 horas-caja |
| Horas suplementarias PART | 0 |

- Demuestra coherencia entre demanda y plan.
- **No** certifica optimalidad global ni **cumplimiento jurídico** (§5.6).
- Sin nombres, horarios individuales ni documentos laborales.
- El fixture anonimizado de la semana 47 del repo tiene sus propias métricas y no debe confundirse con esta evidencia.

## 12. Riesgos de seguridad, migración y compatibilidad

| Riesgo | Mitigación |
|---|---|
| Publicación «oficial» desde el cliente | I0: solo la RPC tras la Function escribe PUBLICADO y tramos; `revoke` para los roles del cliente; pruebas de políticas. |
| Solapamiento de vigencias bajo concurrencia | Restricción de exclusión, bloqueo consultivo por sucursal, control optimista y prueba de concurrencia. |
| Reemplazo que altera días pasados | `F` ≥ mañana; la Function verifica que los días anteriores a `F` sean idénticos; recorte sin reescritura. |
| Equidad calculada sobre lo no vigente | Historial resuelto por fecha y tramo; prueba con borradores, reemplazos y prueba local. |
| Pérdida de cobertura o de picos por continuidad | Tolerancia 0 hasta D9, objetivo mínimo, picos protegidos por franja y explicación obligatoria. |
| Conformidad legal implícita | Validez técnica separada de la jurídica; I13; leyenda en el PDF; D5. |
| Resultados distintos según el equipo | Corte por trabajo; límite de seguridad registrado y advertido. |
| Acceso por usuario a escala | P1 antes de cualquier publicación oficial. |
| Proyecto y sitio compartidos con Prestify | P0 en solo lectura y D13; ninguna migración sin coordinación, respaldo y reversión. |
| Migración de `semanas_historial` | Copia idempotente, tabla original intacta y reversión documentada. |
| Datos personales | Fixtures sintéticos; ausencias sin diagnóstico; nada laboral en GitHub. |
| Aprendizaje que se vuelve regla | Tipo restringido a PREFERENCIA; el validador no lee la memoria; pruebas. |
| Horas suplementarias por error | Apagadas por defecto, triple condición y control del validador. |
| Costos | Sin servicios nuevos. |

## 13. Plan de PR por dependencia (corrección 7)

**Regla de orden:** ningún PR que permita **publicación oficial** se presenta antes de que estén **integrados y verificados**:
- **P1:** membresías, roles y aislamiento con pruebas de políticas;
- **P2:** tablas, restricción de exclusión, RPC transaccional y Function `publicar` con revalidación.

La experiencia en la 091 antes de eso se limita a **prueba local** (U1).

```text
 B0 (este PR, documental)
  │
  ├─ Dominio puro, sin migración ni UI ─────────────────────────────────────────────┐
  │   B1 planificación (ciclos, estados, tramos de vigencia, historial por fecha,   │
  │      diff, huellas) · B2 contingencias · B3 memoria · B4 fuente de demanda       │
  │                                                                                  │
  ├─ Rendimiento ─ W1 Web Worker ──► W2 corte por trabajo (D12)                      │
  │                                                                                  │
  ├─ Prueba local en la 091 (sin migración, bandera, NO oficial)                     │
  │   U1 revisión local: BORRADOR/VALIDADO/APROBADO «prueba», PDF «NO OFICIAL» ◄── B1│
  │   U3 motivo de modificaciones (local) ◄── B3, U1                                 │
  │                                                                                  │
  ├─ Plataforma (MIGRACIONES autorizadas) ──────────────────────────────────────────┤
  │   P0 inventario solo lectura (+ D13) ──► P1 empresa/región/sucursal/membresías   │
  │        + RLS + pruebas de políticas ──► P2 versiones, publicaciones, tramos con   │
  │        exclusión, auditoría, RPC publicar_version, Function publicar           │
  │        (revalidación) + pruebas de concurrencia                                 │
  │                                   │                                             │
  │                                   ▼                                             │
  │   O1 PUBLICACIÓN OFICIAL en la 091 (UI conectada a P2) ◄── P1, P2, U1, B1 ◄────┘
  │        ├─► U2 ciclos configurados + «vigente» + rotación por historial efectivo
  │        ├─► P3 ausencias (tabla + UI) ◄── B2
  │        ├─► P4 memoria persistente ◄── B3, U3
  │        └─► P5 reglas v2 + IDs estables
  │
  └─ Motor (autorización de motor, después de O1)
      C1 continuidad (picos protegidos, tolerancia 0) ◄── U2, B4
      C2 rotación de ciclo ◄── C1, B3
      D1 replanificación parcial con recorte de tramos ◄── P3, C1, O1
      S1 horas suplementarias ◄── D1 + validación normativa
```

| PR | Contenido | Depende de | Migración | Motor | Oficial |
|---|---|---|---|---|---|
| B1 | `src/planificacion/`: ciclos, máquina de estados con ámbitos, `TramoVigencia` y recortes, `historialEfectivo` por fecha, diff y huellas | B0 | No | No | No |
| B2 | `src/contingencias/` | B1 | No | No | No |
| B3 | `src/memoria/` | B1 | No | No | No |
| B4 | `src/demanda/` | B1 | No | No | No |
| W1 | Web Worker | — | No | No (mismo cálculo) | No |
| W2 | Corte por trabajo con registro de búsqueda | W1, D12 | No | Sí (presupuesto) | No |
| U1 | Revisión local de prueba en la 091 (bandera); PDF «PRUEBA LOCAL — NO OFICIAL» | B1 | No | No | **No** |
| U3 | Motivo y clasificación de modificaciones (local) | B3, U1 | No | No | No |
| P0 | Inventario de solo lectura y plan de aislamiento de Prestify | — | No | No | No |
| P1 | Organización, membresías, `tiene_acceso`, políticas y pruebas | P0 | **Sí** | No | No |
| P2 | Versiones, publicaciones, `tramos_vigencia` con exclusión, auditoría, RPC, Function con revalidación, copia desde `semanas_historial` y pruebas de concurrencia | P1 | **Sí** | No | Habilita |
| **O1** | **Publicación oficial** en la 091: UI conectada a la Function y la RPC; PDF oficial con estado jurídico del perfil | P1, P2, U1, B1 | No | No | **Sí** |
| U2 | Ciclos configurados, «vigente» y rotación por historial efectivo | O1 | No | No (solo sesgos de entrada) | — |
| P3 | Ausencias | O1, B2 | **Sí** | No | — |
| P4 | Memoria persistente | O1, B3, U3 | **Sí** | No | — |
| P5 | Reglas v2 e IDs estables | P1 | **Sí** | No | — |
| C1 | Continuidad con picos protegidos y tolerancia 0 | U2, B4 | No | **Sí** | — |
| C2 | Rotación de ciclo | C1, B3 | No | **Sí** | — |
| D1 | Replanificación parcial con recorte de tramos | P3, C1, O1 | No | **Sí** | — |
| S1 | Horas suplementarias PART | D1, validación normativa | Sí | **Sí** | — |

## 14. Pruebas y criterios de aceptación por PR

**Transversal a todos los PR:**
- `tsc`, Vitest, build y Playwright en verde;
- benchmark de 200 escenarios **idéntico** en todo PR que no toque el motor;
- sin datos personales;
- CURRENT_WORK al día.

- **B1:**
  - ciclos de 1, 4 y 5 semanas; `validarCalendario` rechaza superposiciones, huecos y un inicio que no es lunes o un fin que no es domingo;
  - cruce de mes sin ciclo nuevo → no es primera semana del ciclo (#44 (e)); con un ciclo nuevo, sí (#44 (b));
  - máquina de estados:
    · un ámbito `prueba-local` **nunca** llega a PUBLICADO (I0);
    · VALIDADO caduca ante cualquier cambio de huella;
    · no se publica sin VALIDADO y aprobación;
    · no se edita lo publicado;
    · `F` en el pasado o en el día en curso es rechazado (I4);
    · ningún agente actúa;
  - **vigencia parcial:** el reemplazo desde el miércoles deja lunes y martes en V1 y de miércoles a domingo en V2; el tramo anterior se recorta y no se reescribe; un tramo no iniciado se anula;
  - **prueba de propiedad:** con secuencias aleatorias de publicaciones y reemplazos, `verificarSinSolapamientos` siempre se cumple y cada fecha tiene un tramo efectivo como máximo (I1);
  - **historial por fecha:** con V1 reemplazada desde el miércoles, la equidad cuenta lunes y martes de V1 y el resto de V2; los borradores, la prueba local, los descartados, las fechas futuras y los tramos anulados no cuentan; las ausencias confirmadas se descuentan (#44 (g));
  - `diffHorarios` distingue un ajuste de 30 min de un cambio de turno y admite rango;
  - las huellas son estables y sensibles a cualquier cambio;
  - **textos y estados:** ningún estado ni mensaje de dominio contiene «legal» ni «cumple la ley» (I13).
- **B2:** persona ausente sigue en el roster y no es asignable; ausencia abierta; alcance parcial; ausencia anulada; equivalencia con las excepciones actuales.
- **B3:** una excepción temporal nunca genera preferencia; una recurrente genera solo una propuesta; una confirmada produce solo sesgo blando; un conflicto con una regla descarta la preferencia; la equidad usa el historial por fecha.
- **B4:** `pom-pdf` produce la misma matriz que el parser actual; `manual` valida; la huella es estable.
- **W1:** mismos resultados en el worker y en el hilo principal; la tarea larga más larga dura menos de 200 ms con 9, 20, 35 y 55 cajeros a 1×, 4× y 6×; Cancelar funciona.
- **W2:**
  - misma entrada → `JSON` idéntico en Node, Chromium 1× y Chromium 6×;
  - ninguna decisión depende del reloj (prueba con reloj simulado constante);
  - el límite de seguridad forzado deja `busqueda.completa = false`, el motivo y lo omitido, y la UI y el PDF lo advierten;
  - benchmark de 200 escenarios documentado.
- **U1:**
  - con la bandera apagada, los 11 E2E actuales pasan sin cambios;
  - con la bandera encendida:
    · BORRADOR, VALIDADO y APROBADO marcados «prueba local»;
    · **no existe botón ni camino a PUBLICADO**;
    · el PDF dice «PRUEBA LOCAL — NO OFICIAL» y el estado jurídico del perfil;
    · recargar conserva el estado.
- **P0:** inventario con evidencia, sin escrituras.
- **P1:**
  - pruebas de políticas positivas y negativas por rol y tabla en Supabase local (CI);
  - la sucursal activa sale de las membresías;
  - reversión probada.
- **P2:**
  - invocar directamente la RPC desde el navegador con un JWT `authenticated` (incluso de aprobador) → rechazado; verificar que la Function sea la única vía autorizada y que ninguna credencial privilegiada figure en `dist/`;
  - escribir `PUBLICADO` o tramos sin RPC → rechazado;
  - publicación con validación falsificada → la Function la rechaza;
  - **dos publicaciones concurrentes** sobre intervalos que se solapan → una gana y la otra recibe un conflicto, sin solapamiento en la base (restricción de exclusión verificada);
  - recorte desde el miércoles correcto en la base;
  - copia idempotente;
  - auditoría solo de agregado.
- **O1:**
  - publicación oficial en la 091 de extremo a extremo (E2E con Supabase local o interceptado según el PR);
  - el PDF oficial muestra versión, aprobador, validación técnica en el servidor y estado jurídico del perfil;
  - sin red o sin la Function, no se publica.
- **U2:** «Último horario» = vigente por fecha; la rotación usa el historial por fecha (borradores y prueba local sin efecto); mensual = una publicación con 4 o 5 tramos.
- **U3, P3, P4 y P5:** criterios de B2, B3 y #11/#9 con persistencia y pruebas de políticas.
- **C1:**
  - POM idéntico → `mantener-vigente`, con cero cambios si cumple el objetivo y los picos;
  - **nunca** baja del 95 % si el mejor lo alcanza;
  - **ninguna franja pico** con más déficit que el mejor;
  - con tolerancia 0, la cobertura elegida es igual a la del mejor;
  - semanas 2 a 4 similares → cambios pequeños (#44 (a));
  - pico intramensual → cambios con explicación (#44 (f));
  - sin regresiones frente al respaldo (AH2-020).
- **C2:** rotación en ciclo nuevo sin bajar cobertura ni picos (#44 (b) y (c)); el turno fijo prevalece (#44 (d)).
- **D1:**
  - ausencia el miércoles: lunes y martes intactos, en la base y en el PDF;
  - recorte de tramo y versión nueva solo desde `F`;
  - se revalida la semana completa;
  - mínimos cambios.
- **S1:** sin autorización, más de 32 h es una violación; con las tres condiciones, solo cubre déficit residual; marcado e informado.

**Escala** (B1 a O1, datos sintéticos):
- 160 sucursales × 6 ciclos con reemplazos parciales aleatorios;
- cero solapamientos;
- cero cruces de datos;
- origen de cada valor visible;
- resolución de vigencia e historial en menos de 50 ms por sucursal.

## 15. Decisiones: criterio recomendado frente a autorización expresa (corrección 6)

**Aprobar la dirección general (15/11/2026) no autoriza** implementación, migraciones, publicación oficial ni merge. Cada fila separa el **criterio de diseño recomendado** (sugerencia técnica) de la **autorización expresa del propietario**, que hoy está **pendiente en todas**.

| ID | Tema | Criterio de diseño recomendado | Autorización expresa del propietario | Estado |
|---|---|---|---|---|
| D1 | Estados | BORRADOR → VALIDADO (técnico, ligado a huella) → APROBADO → PUBLICADO (solo servidor) | El propietario ya pidió los cuatro estados. El detalle (huella, ámbitos) requiere confirmación. | Requisito aprobado; detalle **pendiente** |
| D2 | Límites del ciclo | Inicio en lunes y fin en domingo | Aprobar la regla | **Pendiente** |
| D3 | Aprobación propia | Configurable por sucursal; en la 091 permitida y auditada | Aprobar para la 091 | **Pendiente** |
| D4 | Semanas legadas | «Legado presunto» solo para la rotación, transitorio, nunca publicado | Aprobar el tratamiento | **Pendiente** |
| D5 | Publicación con perfil sin validación jurídica | Permitirla solo con la leyenda de estado jurídico en UI y PDF (I13) | **Decisión del propietario** (riesgo legal) | **Pendiente** |
| D6 | Retención | Descartadas: 12 meses y luego archivo; publicadas y tramos: siempre | Aprobar la política | **Pendiente** |
| D7 | Calendario de ciclos | La empresa propone; cada sucursal confirma | Aprobar | **Pendiente** |
| D8 | Alcance organizacional | Una empresa con al menos 160 sucursales y regiones; el modelo admite varias empresas | El propietario lo definió | **Resuelta** (requisito) |
| D9 | Tolerancia de continuidad y umbrales de demanda | **0 hasta tener benchmark**; después, un valor por sucursal aprobado por el propietario; picos siempre protegidos | Aprobar el benchmark (tramo C) y luego el valor | **Pendiente** |
| D10 | Revalidación en el servidor | Obligatoria para lo oficial (Function `publicar`) | Aprobar (necesaria para O1) | **Pendiente** |
| D11 | Motivos de modificación | Lista base editable por la empresa | Aprobar la lista base | **Pendiente** |
| D12 | Corte por trabajo | Sí, con límite de seguridad registrado y advertido; benchmark documentado antes de integrarlo | Autorizar W2 (cambia el motor) | **Pendiente** |
| D13 | Aislamiento respecto de Prestify | Separar proyecto, esquema y sitio antes de comercializar; P0 primero | Decisión y autorización (afecta a otro producto) | **Pendiente** |
| D14 | Replanificación del día en curso | No en la primera versión: `F` ≥ mañana | Aprobar o pedir alternativa | **Pendiente** |

**Autorizaciones de ejecución, todas pendientes:**
- cada PR de código (B1…S1);
- cada migración (P1–P5, S1);
- la habilitación de la publicación oficial por sucursal (O1 y despliegues siguientes);
- el merge de este PR documental.
