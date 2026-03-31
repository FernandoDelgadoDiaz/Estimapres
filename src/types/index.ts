export interface Colaborador {
  id: string
  nombre: string
  tipo: 'FULL' | 'PART' | 'AUX'
  horasSemanales: number
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
}

export interface HorarioColaborador {
  colaboradorId: string
  jornadas: JornadaAsignada[]  // 7 elementos, uno por día
  totalHoras: number
  errores: string[]
  rolGeneral: 'cajero' | 'aux_supervisor' | 'aux_eventual' | 'eventual_sector'
}

export interface ResultadoAsignacion {
  horarios: HorarioColaborador[]
  coberturaFranjas: number[][]  // [franja][dia] = cajeros asignados
  faltantesFranjas: number[][]  // [franja][dia] = diferencia (negativo = falta)
  alertas: string[]
  porcentajeCobertura: number
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
  id: string
  colaboradorNombre: string
  tipo: 'franco_dia' | 'no_antes_de' | 'no_despues_de' | 'siempre_cierre' | 'solo_matutino' | 'solo_nocturno'
  valor?: string
  descripcion: string
}

export interface Auxiliar {
  id: string
  nombre: string
  horarioSemanal: string[]  // 7 elementos, índice 0=lunes, "" = franco
  activo: boolean
}

export interface Eventual {
  id: string
  nombre: string
  sector: string
  horarioSemanal: string[]  // 7 elementos, "" = no disponible
  activo: boolean
}

export const COLABORADORES_INICIALES: Colaborador[] = [
  { id: '1', nombre: 'Carlos Paz', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: '2', nombre: 'Gabriel Silva', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: '3', nombre: 'Claudia Altamirano', tipo: 'PART', horasSemanales: 30, activo: true },
  { id: '4', nombre: 'Giuliana Ciarlante', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '5', nombre: 'Ignacio Barrios', tipo: 'PART', horasSemanales: 30, activo: true },
  { id: '6', nombre: 'Jorgelina Nanez', tipo: 'PART', horasSemanales: 30, activo: true },
  { id: '7', nombre: 'Mariana Soruco', tipo: 'PART', horasSemanales: 30, activo: true },
  { id: '8', nombre: 'Martina Beron', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '9', nombre: 'Tobias Benitez', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '10', nombre: 'Fernando Mendez', tipo: 'AUX', horasSemanales: 48, activo: true },
  { id: '11', nombre: 'Monica Enriquez', tipo: 'AUX', horasSemanales: 48, activo: true },
  { id: '12', nombre: 'Natalia Martinez', tipo: 'AUX', horasSemanales: 48, activo: true },
  { id: '13', nombre: 'Teresa Alanoca', tipo: 'AUX', horasSemanales: 48, activo: true },
]

export const AUXILIARES_INICIALES: Auxiliar[] = [
  {
    id: "aux1",
    nombre: "Fernando Mendez",
    horarioSemanal: ["11:00-19:00", "", "08:00-13:00|19:00-23:00", "14:00-23:00", "11:00-19:00", "14:00-23:00", "18:00-23:00"],
    activo: true
  },
  {
    id: "aux2",
    nombre: "Monica Enriquez",
    horarioSemanal: ["08:00-16:00", "08:00-14:00|20:00-23:00", "11:00-19:00", "", "08:00-13:00|19:00-23:00", "14:00-23:00", "12:00-17:00"],
    activo: true
  },
  {
    id: "aux3",
    nombre: "Natalia Martinez",
    horarioSemanal: ["14:00-23:00", "11:00-20:00", "", "08:00-14:00|20:00-23:00", "15:00-23:00", "11:00-16:00", "11:00-19:00"],
    activo: true
  },
  {
    id: "aux4",
    nombre: "Teresa Alanoca",
    horarioSemanal: ["15:00-23:00", "14:00-23:00", "15:00-23:00", "14:00-23:00", "", "08:00-13:00", "08:00-14:00|20:00-23:00"],
    activo: true
  }
]

export const EVENTUALES_INICIALES: Eventual[] = []