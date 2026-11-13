import type { Auxiliar, Colaborador } from '../../src/types'

export const CAJEROS_DE_PRUEBA: Colaborador[] = [
  { id: '1', nombre: 'Full A', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: '2', nombre: 'Full B', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: '3', nombre: 'Part A', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '4', nombre: 'Part B', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '5', nombre: 'Part C', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '6', nombre: 'Part D', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '7', nombre: 'Part E', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '8', nombre: 'Part F', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '9', nombre: 'Part G', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: '10', nombre: 'Aux A', tipo: 'AUX', horasSemanales: 48, activo: true },
  { id: '11', nombre: 'Aux B', tipo: 'AUX', horasSemanales: 48, activo: true },
  { id: '12', nombre: 'Aux C', tipo: 'AUX', horasSemanales: 48, activo: true },
  { id: '13', nombre: 'Aux D', tipo: 'AUX', horasSemanales: 48, activo: true },
]

export const AUXILIARES_DE_PRUEBA: Auxiliar[] = [
  {
    id: "aux1",
    nombre: "Aux A",
    horarioSemanal: ["11:00-19:00", "", "08:00-13:00|19:00-23:00", "14:00-23:00", "11:00-19:00", "14:00-23:00", "18:00-23:00"],
    activo: true
  },
  {
    id: "aux2",
    nombre: "Aux B",
    horarioSemanal: ["08:00-16:00", "08:00-14:00|20:00-23:00", "11:00-19:00", "", "08:00-13:00|19:00-23:00", "14:00-23:00", "12:00-17:00"],
    activo: true
  },
  {
    id: "aux3",
    nombre: "Aux C",
    horarioSemanal: ["14:00-23:00", "11:00-20:00", "", "08:00-14:00|20:00-23:00", "15:00-23:00", "11:00-16:00", "11:00-19:00"],
    activo: true
  },
  {
    id: "aux4",
    nombre: "Aux D",
    horarioSemanal: ["15:00-23:00", "14:00-23:00", "15:00-23:00", "14:00-23:00", "", "08:00-13:00", "08:00-14:00|20:00-23:00"],
    activo: true
  }
]
