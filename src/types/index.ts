export interface Colaborador {
  id: string
  nombre: string
  tipo: 'FULL' | 'PART' | 'AUX'
  /**
   * Horas semanales de la ficha. #7: en un PART es su objetivo contractual; puede
   * faltar (sin dato registrado) y la validación lo informa: nunca se asume un valor.
   */
  horasSemanales?: number
  activo: boolean
}

export interface Franja {
  hora: string
  necesidad: number[] // índice 0=lunes ... 6=domingo
}

export interface Turno {
  inicio: string // HH:MM
  fin: string    // HH:MM
}

export interface JornadaAsignada {
  dia: number           // 0=lunes ... 6=domingo
  turnos: Turno[]       // 1 turno para PART/corrido, 2 para cortado
  horas: number
  esFranco: boolean
  rol: 'cajero' | 'aux_supervisor' | 'aux_cierre' | 'aux_eventual' | 'eventual_sector' | 'franco' | 'franco_medio'
  /**
   * AH2-057: la persona avisó que no viene ese día. La jornada visible queda vacía (no cubre caja) y se
   * conserva la jornada comunicada: el validador la acredita para el contrato (composición, horas, descanso),
   * porque una ausencia no es un franco ni una jornada nueva.
   */
  ausencia?: AusenciaJornada
}

/** AH2-057 · Ausencia sobre una jornada ya comunicada. */
export interface AusenciaJornada {
  motivo: string
  turnosOriginales: Turno[]
  horasOriginales: number
  rolOriginal: JornadaAsignada['rol']
}

/** AH2-057 · Ausencia cargada sobre una semana ya generada (persona, rango y aviso). */
export interface AusenciaCargada {
  id: string
  colaboradorId: string
  nombre: string
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  motivo: string
  /** Día del aviso (YYYY-MM-DD, hora local): la propuesta arranca el día siguiente. */
  aviso: string
}

/** AH2-057 · Registro de la versión aprobada por contingencia. */
export interface ContingenciaAprobada {
  ausencia: AusenciaCargada
  opcion: 'menor_impacto' | 'mejor_cobertura'
  aprobadoPor: string
  aprobadoEl: string // ISO
  basadaEnVersion: number
  desde: string | null // primer día modificado
  cambios: number
}

export interface HorarioColaborador {
  colaboradorId: string
  jornadas: JornadaAsignada[]  // 7 elementos, uno por día
  totalHoras: number
  errores: string[]
  rolGeneral: 'cajero' | 'aux_supervisor' | 'aux_eventual' | 'eventual_sector'
}

/**
 * Horario de CAJA de un AUX o EVENTUAL: por cada día (0=Lun..6=Dom) una fila de
 * 30 slots de 30 min (slot 0 = 08:00) marcada true cuando el colaborador debe
 * estar sentado en CAJA ese slot. Deriva de asignacion_aux / asignacion_eventual
 * del algoritmo v2 (Pasadas 2 y 3).
 */
export interface AsignacionCajaColaborador {
  colaboradorId: string
  nombre: string
  slotsCajaPorDia: boolean[][]  // [dia][slot] = true si está en CAJA
}

export interface ResultadoAsignacion {
  hibrido?: import('../hibrido/generacionIntegrada').RegistroHibrido
  condicionesSupervisor?: import('../algoritmo/condicionesTipos').AuditoriaCondiciones
  horarios: HorarioColaborador[]
  coberturaFranjas: number[][]  // [franja][dia] = cajeros asignados
  faltantesFranjas: number[][]  // [franja][dia] = diferencia (negativo = falta)
  alertas: string[]
  porcentajeCobertura: number
  // Horarios en CAJA de supervisores (AUX) y eventuales, para el PDF.
  cajaAux?: AsignacionCajaColaborador[]
  cajaEventual?: AsignacionCajaColaborador[]
  // #38: celdas de eventuales fijadas a mano ("id|día"): el recálculo las respeta.
  eventualesFijos?: string[]
  // #7: objetivo vs horas asignadas por contrato (FULL/PART), con motivo si no se cumple.
  cumplimientoHoras?: import('../algoritmo/contratos').CumplimientoHoras[]
  // #7: costo de priorizar las horas objetivo (se descarta tras una edición manual).
  impactoHoras?: import('../algoritmo/contratos').ImpactoPrioridadHoras
  /** #7 · AH2-020: estrategia elegida por el multi-arranque y métricas de cada candidato. */
  multiArranque?: import('../utils/generacionMultiArranque').SeleccionMultiArranque
}

export type DiaSemana = 'Lun' | 'Mar' | 'Mié' | 'Jue' | 'Vie' | 'Sáb' | 'Dom'

export const DIAS_SEMANA: DiaSemana[] = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export const HORAS_FRANJAS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30',
  '22:00'
]

export interface ExcepcionSemanal {
  /** ID estable opcional; condiciones nuevas no se vinculan por nombre. */
  colaboradorId?: string
  dias?: number[]
  id: string
  colaboradorNombre: string
  tipo: 'inicio_no_despues_de' | 'franco_dia' | 'no_antes_de' | 'no_despues_de' | 'siempre_cierre' | 'solo_matutino' | 'solo_nocturno'
    // AH2-056: pedido de turno (cantidad de cortadas FULL en la semana y mínimo de mañanas).
    | 'cortadas_semana' | 'mananas_min' | 'cortada_inicio_hasta'
  valor?: string
  descripcion: string
}

export interface Auxiliar {
  id: string
  nombre: string
  horarioSemanal: string[]  // 7 elementos, índice 0=lunes, "" = franco
  activo: boolean
  horasSemanales?: number
}

export interface Eventual {
  id: string
  nombre: string
  sector: string
  horarioSemanal: string[]  // 7 elementos, "" = no disponible
  activo: boolean
  maxHorasSemanales?: number
}

// ==================== REGLAS CONFIGURABLES (Capacidad 1) ====================

export type TipoReglaColaborador =
  | 'no_antes_de'      // no puede entrar antes de cierta hora
  | 'no_despues_de'    // no puede salir después de cierta hora
  | 'franco_fijo'      // franco siempre el mismo día
  | 'siempre_cierre'   // siempre turno de cierre
  | 'siempre_manana'   // siempre turno de mañana
  | 'turno'            // AH2-056: pedido de turno (mañana, intermedio, tarde, noche, cortado según contrato)

export type TipoReglaLocal =
  | 'min_cajeros_franja' // mínimo N cajeros en una franja horaria
  | 'max_bloques_caja_eventual_dia'
  | 'eventuales_caja_hora_limite'
  | 'max_francos_dia'    // máximo N francos el mismo día
  // Reglas operativas booleanas (toggles). El campo `activa` de la regla
  // guarda el estado del toggle. Si NO existe una regla de ese tipo, se usa
  // el default del negocio (ver DEFAULTS_OPERATIVOS / configOperativaDeReglas).
  | 'apertura_solo_aux'          // R1 default ON: 08:00-09:00 sólo con AUX
  | 'sin_aux_cierre'             // R2 default ON: AUX no en caja después 22:00
  | 'supervisor_jornada_completa'// R3 default OFF: un AUX parado toda la jornada
  | 'franco_medio_corridos'      // R4 default ON: medio franco pegado al franco

export interface ReglaConfigurable {
  id: string
  ambito: 'colaborador' | 'local'
  tipo: TipoReglaColaborador | TipoReglaLocal
  colaboradorNombre?: string // solo ámbito colaborador
  dia?: number               // 0=Lun..6=Dom; -1 = todos los días (min_cajeros_franja / franco_fijo)
  hora?: string              // HH:MM para no_antes_de / no_despues_de
  horaDesde?: string         // HH:MM, franja para min_cajeros_franja
  horaHasta?: string
  cantidad?: number          // N para min_cajeros_franja / max_francos_dia
  turno?: 'manana' | 'intermedio' | 'tarde' | 'noche' | 'cortado' | 'cierre' // AH2-056: solo tipo 'turno'
  vigenciaDesde?: string     // YYYY-MM-DD (opcional: restricción temporal)
  vigenciaHasta?: string
  activa: boolean
  descripcion: string
  creadaEl: string           // ISO
}

// ==================== HISTORIAL Y ROTACIÓN (Capacidad 2) ====================

export interface ResumenTurnos {
  mananas: number
  tardes: number
  cierres: number
  francos: number
  francosDias?: number[]    // qué días de la semana fueron franco (0=Lun..6=Dom)
  findeTrabajado?: boolean  // trabajó sábado y domingo
}

export interface SemanaHistorial {
  hibrido?: import('../hibrido/generacionIntegrada').RegistroHibrido
  condicionesSupervisor?: import('../algoritmo/condicionesTipos').AuditoriaCondiciones
  id: string
  fechaLunes: string   // YYYY-MM-DD
  version: number      // versionado: regenerar la misma semana crea v2, v3...
  descripcion: string
  generadoEl: string   // ISO
  modificadoEl?: string // ISO de la última edición manual (si hubo)
  resumenPorColaborador: Record<string, ResumenTurnos> // key = nombre del colaborador
  horarios: HorarioColaborador[]
  editadoManualmente: boolean
  /** AH2-057: ausencias cargadas sobre esta semana (se heredan en las versiones siguientes). */
  ausencias?: AusenciaCargada[]
  /** AH2-057: esta versión se aprobó como cobertura de una ausencia. */
  contingencia?: ContingenciaAprobada
  // Snapshot opcional del resto del resultado, para poder re-exportar el PDF
  // completo desde "Último horario" (con las ediciones aplicadas).
  cajaAux?: AsignacionCajaColaborador[]
  cajaEventual?: AsignacionCajaColaborador[]
  coberturaFranjas?: number[][]
  faltantesFranjas?: number[][]
  porcentajeCobertura?: number
  // Necesidad de cajas del PDF original [franja][dia]: referencia para el
  // panel de cobertura en tiempo real del editor.
  necesidadFranjas?: number[][]
  // #38: estado EFECTIVO de las reglas operativas con el que se generó la semana
  // (se revalida con él tras cada edición y antes de exportar). Ausente en
  // semanas anteriores a #38: se usan los predeterminados del negocio.
  configOperativa?: {
    aperturaSoloAux: boolean
    sinAuxCierre: boolean
    supervisorJornadaCompleta: boolean
    francoMedioCorridos: boolean
    maxBloquesCajaEventualDia?: number
    eventualesCajaHoraLimite?: string
  }
  // #38: disponibilidad RESUELTA de la semana (patrón habitual + excepciones por
  // fecha) por id de AUX/eventual, mismo formato que horarioSemanal. Permite
  // revalidar presencia/disponibilidad tras ediciones y antes de exportar.
  disponibilidadSemana?: Record<string, string[]>
  antecedenteDomingo?: import('../utils/antecedenteDomingo').AntecedenteDomingo
  // #38: celdas de eventuales fijadas a mano ("id|día").
  eventualesFijos?: string[]
  // #7: perfil de horas por contrato con que se generó (contratos.ts). Ausente en
  // semanas anteriores: se validan con el perfil histórico del motor (PART ≤ 31 h).
  perfilHorasId?: string
  // #7: objetivo vs horas asignadas por contrato, tal como lo informó el motor.
  cumplimientoHoras?: import('../algoritmo/contratos').CumplimientoHoras[]
  // #7 · AH2-020: cómo se generó (versión del algoritmo, estrategia multi-arranque elegida,
  // mejora frente al respaldo, estrategias omitidas y validez). Ausente en semanas anteriores.
  // Describe la GENERACIÓN: no cambia tras ediciones manuales (ver editadoManualmente).
  generacion?: import('../utils/generacionMultiArranque').RegistroGeneracion
}

// ==================== CORRECCIONES Y APRENDIZAJE (Capacidad 3) ====================

export interface JornadaResumida {
  esFranco: boolean
  turnos: Turno[]
}

export interface CorreccionManual {
  id: string
  fecha: string        // ISO
  semanaId: string
  colaboradorNombre: string
  dia: number          // 0=Lun..6=Dom
  antes: JornadaResumida
  despues: JornadaResumida
}

export type DireccionAprendizaje =
  | 'prefiere_manana'
  | 'prefiere_tarde'
  | 'prefiere_cierre'
  | 'evita_cierre'
  | 'hora_preferida'

export interface AprendizajeDerivado {
  colaboradorNombre: string
  direccion: DireccionAprendizaje
  dia?: number          // presente = aprendizaje fino de un día concreto (0=Lun..6=Dom)
  valor?: string        // para hora_preferida: "HH:MM" de entrada preferida
  evidencias: number
  correccionIds: string[]
  descripcion: string
}
