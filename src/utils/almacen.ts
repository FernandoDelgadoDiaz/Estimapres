// src/utils/almacen.ts
// Capa de persistencia de las capacidades configurables.
//
// Backend principal: Supabase (tablas reglas_configurables, semanas_historial,
// correcciones_manuales, aprendizajes_derivados, con RLS local_id = auth.uid()).
// Fallback degradado: localStorage, solo cuando Supabase no está configurado o
// no responde (sin envs, sin conexión, proyecto pausado). Al recuperar Supabase,
// los datos locales existentes se migran automáticamente una única vez.
//
// Los hooks consumen esta API async y mantienen su interfaz síncrona con
// estado optimista: la UI nunca espera a la red.

import { supabase, asegurarSesion } from '../lib/supabase'
import type {
  ReglaConfigurable,
  SemanaHistorial,
  CorreccionManual,
  AprendizajeDerivado,
} from '../types'

export const CLAVES_ALMACEN = {
  reglas: 'aliada_reglas_configurables',
  historial: 'aliada_historial_semanas',
  correcciones: 'aliada_correcciones_manuales',
  migrado: 'aliada_migrado_a_supabase',
} as const

export const LIMITE_HISTORIAL_SEMANAS = 60 // con versionado hace falta más margen
export const LIMITE_CORRECCIONES = 300

// ==================== LOCALSTORAGE (fallback) ====================

export function leerAlmacen<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    if (!crudo) return porDefecto
    return JSON.parse(crudo) as T
  } catch (error) {
    console.error(`Error leyendo ${clave} de localStorage:`, error)
    return porDefecto
  }
}

export function guardarAlmacen<T>(clave: string, valor: T): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch (error) {
    console.error(`Error guardando ${clave} en localStorage:`, error)
  }
}

// ==================== BACKEND ACTIVO ====================

let inicioPromise: Promise<string | null> | null = null

/** uid del usuario (sesión anónima incluida) o null → fallback localStorage. */
async function backendUid(): Promise<string | null> {
  inicioPromise ??= (async () => {
    const uid = await asegurarSesion()
    if (uid && supabase) {
      try {
        await migrarLocalASupabase()
      } catch (error) {
        console.error('Migración inicial a Supabase falló:', error)
      }
    }
    return uid
  })()
  return inicioPromise
}

export async function backendActivo(): Promise<'supabase' | 'local'> {
  return (await backendUid()) ? 'supabase' : 'local'
}

// ==================== MAPEOS FILA ↔ TIPO ====================

interface FilaRegla {
  id: string
  tipo: 'colaborador' | 'general'
  colaborador_nombre: string | null
  parametros: Record<string, unknown>
  activa: boolean
  fecha_desde: string | null
  fecha_hasta: string | null
  descripcion: string
  created_at: string
}

function reglaAFila(r: ReglaConfigurable): Omit<FilaRegla, 'created_at'> {
  return {
    id: r.id,
    tipo: r.ambito === 'local' ? 'general' : 'colaborador',
    colaborador_nombre: r.colaboradorNombre ?? null,
    parametros: {
      tipo: r.tipo,
      dia: r.dia,
      hora: r.hora,
      horaDesde: r.horaDesde,
      horaHasta: r.horaHasta,
      cantidad: r.cantidad,
    },
    activa: r.activa,
    fecha_desde: r.vigenciaDesde ?? null,
    fecha_hasta: r.vigenciaHasta ?? null,
    descripcion: r.descripcion,
  }
}

function filaARegla(f: FilaRegla): ReglaConfigurable {
  const p = f.parametros ?? {}
  return {
    id: f.id,
    ambito: f.tipo === 'general' ? 'local' : 'colaborador',
    tipo: p.tipo as ReglaConfigurable['tipo'],
    colaboradorNombre: f.colaborador_nombre ?? undefined,
    dia: p.dia as number | undefined,
    hora: p.hora as string | undefined,
    horaDesde: p.horaDesde as string | undefined,
    horaHasta: p.horaHasta as string | undefined,
    cantidad: p.cantidad as number | undefined,
    vigenciaDesde: f.fecha_desde ?? undefined,
    vigenciaHasta: f.fecha_hasta ?? undefined,
    activa: f.activa,
    descripcion: f.descripcion,
    creadaEl: f.created_at,
  }
}

interface FilaSemana {
  id: string
  lunes_fecha: string
  version: number
  horario_completo: Record<string, unknown>
  metricas: Record<string, unknown>
  created_at: string
}

function semanaAFila(s: SemanaHistorial): Omit<FilaSemana, 'created_at'> {
  return {
    id: s.id,
    lunes_fecha: s.fechaLunes,
    version: s.version,
    horario_completo: {
      descripcion: s.descripcion,
      generadoEl: s.generadoEl,
      horarios: s.horarios,
      editadoManualmente: s.editadoManualmente,
    },
    metricas: { resumenPorColaborador: s.resumenPorColaborador },
  }
}

function filaASemana(f: FilaSemana): SemanaHistorial {
  const h = f.horario_completo ?? {}
  const m = f.metricas ?? {}
  return {
    id: f.id,
    fechaLunes: f.lunes_fecha,
    version: f.version ?? 1,
    descripcion: (h.descripcion as string) ?? `Semana del ${f.lunes_fecha}`,
    generadoEl: (h.generadoEl as string) ?? f.created_at,
    horarios: (h.horarios as SemanaHistorial['horarios']) ?? [],
    editadoManualmente: (h.editadoManualmente as boolean) ?? false,
    resumenPorColaborador: (m.resumenPorColaborador as SemanaHistorial['resumenPorColaborador']) ?? {},
  }
}

interface FilaCorreccion {
  id: string
  semana_id: string | null
  colaborador_nombre: string
  dia: number
  antes: CorreccionManual['antes']
  despues: CorreccionManual['despues']
  created_at: string
}

function correccionAFila(c: CorreccionManual): Omit<FilaCorreccion, 'created_at'> {
  return {
    id: c.id,
    semana_id: c.semanaId || null,
    colaborador_nombre: c.colaboradorNombre,
    dia: c.dia,
    antes: c.antes,
    despues: c.despues,
  }
}

function filaACorreccion(f: FilaCorreccion): CorreccionManual {
  return {
    id: f.id,
    fecha: f.created_at,
    semanaId: f.semana_id ?? '',
    colaboradorNombre: f.colaborador_nombre,
    dia: f.dia,
    antes: f.antes,
    despues: f.despues,
  }
}

// ==================== NORMALIZACIÓN (datos legacy) ====================

function normalizarSemana(s: SemanaHistorial): SemanaHistorial {
  return { ...s, version: s.version ?? 1 }
}

// ==================== REGLAS ====================

export async function cargarReglas(): Promise<ReglaConfigurable[]> {
  const uid = await backendUid()
  if (!uid || !supabase) return leerAlmacen<ReglaConfigurable[]>(CLAVES_ALMACEN.reglas, [])
  const { data, error } = await supabase
    .from('reglas_configurables')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Error cargando reglas de Supabase:', error.message)
    return leerAlmacen<ReglaConfigurable[]>(CLAVES_ALMACEN.reglas, [])
  }
  return (data as FilaRegla[]).map(filaARegla)
}

export async function guardarRegla(regla: ReglaConfigurable): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    const todas = leerAlmacen<ReglaConfigurable[]>(CLAVES_ALMACEN.reglas, [])
    const idx = todas.findIndex(r => r.id === regla.id)
    if (idx >= 0) todas[idx] = regla
    else todas.push(regla)
    guardarAlmacen(CLAVES_ALMACEN.reglas, todas)
    return
  }
  const { error } = await supabase.from('reglas_configurables').upsert(reglaAFila(regla))
  if (error) console.error('Error guardando regla en Supabase:', error.message)
}

export async function eliminarReglaRemota(id: string): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    const todas = leerAlmacen<ReglaConfigurable[]>(CLAVES_ALMACEN.reglas, [])
    guardarAlmacen(CLAVES_ALMACEN.reglas, todas.filter(r => r.id !== id))
    return
  }
  const { error } = await supabase.from('reglas_configurables').delete().eq('id', id)
  if (error) console.error('Error eliminando regla en Supabase:', error.message)
}

export async function reemplazarReglas(reglas: ReglaConfigurable[]): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    guardarAlmacen(CLAVES_ALMACEN.reglas, reglas)
    return
  }
  const { error: errDel } = await supabase.from('reglas_configurables').delete().eq('local_id', uid)
  if (errDel) console.error('Error limpiando reglas en Supabase:', errDel.message)
  if (reglas.length > 0) {
    const { error } = await supabase.from('reglas_configurables').insert(reglas.map(reglaAFila))
    if (error) console.error('Error importando reglas a Supabase:', error.message)
  }
}

// ==================== HISTORIAL ====================

export async function cargarHistorial(): Promise<SemanaHistorial[]> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    return leerAlmacen<SemanaHistorial[]>(CLAVES_ALMACEN.historial, []).map(normalizarSemana)
  }
  const { data, error } = await supabase
    .from('semanas_historial')
    .select('*')
    .order('lunes_fecha', { ascending: true })
    .order('version', { ascending: true })
    .limit(LIMITE_HISTORIAL_SEMANAS)
  if (error) {
    console.error('Error cargando historial de Supabase:', error.message)
    return leerAlmacen<SemanaHistorial[]>(CLAVES_ALMACEN.historial, []).map(normalizarSemana)
  }
  return (data as FilaSemana[]).map(filaASemana)
}

export async function guardarSemana(semana: SemanaHistorial): Promise<void> {
  // Siempre respaldar en localStorage (aunque Supabase esté activo): así el
  // último horario generado sobrevive sin conexión y al cerrar la pantalla.
  const todas = leerAlmacen<SemanaHistorial[]>(CLAVES_ALMACEN.historial, []).map(normalizarSemana)
  const idx = todas.findIndex(s => s.id === semana.id)
  if (idx >= 0) todas[idx] = semana
  else todas.push(semana)
  guardarAlmacen(CLAVES_ALMACEN.historial, todas.slice(-LIMITE_HISTORIAL_SEMANAS))

  const uid = await backendUid()
  if (!uid || !supabase) return
  const { error } = await supabase.from('semanas_historial').upsert(semanaAFila(semana))
  if (error) console.error('Error guardando semana en Supabase:', error.message)
}

export async function eliminarSemanaRemota(id: string): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    const todas = leerAlmacen<SemanaHistorial[]>(CLAVES_ALMACEN.historial, [])
    guardarAlmacen(CLAVES_ALMACEN.historial, todas.filter(s => s.id !== id))
    return
  }
  const { error } = await supabase.from('semanas_historial').delete().eq('id', id)
  if (error) console.error('Error eliminando semana en Supabase:', error.message)
}

export async function reemplazarHistorial(semanas: SemanaHistorial[]): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    guardarAlmacen(CLAVES_ALMACEN.historial, semanas)
    return
  }
  const { error: errDel } = await supabase.from('semanas_historial').delete().eq('local_id', uid)
  if (errDel) console.error('Error limpiando historial en Supabase:', errDel.message)
  if (semanas.length > 0) {
    const { error } = await supabase.from('semanas_historial').insert(semanas.map(semanaAFila))
    if (error) console.error('Error importando historial a Supabase:', error.message)
  }
}

// ==================== CORRECCIONES ====================

export async function cargarCorrecciones(): Promise<CorreccionManual[]> {
  const uid = await backendUid()
  if (!uid || !supabase) return leerAlmacen<CorreccionManual[]>(CLAVES_ALMACEN.correcciones, [])
  const { data, error } = await supabase
    .from('correcciones_manuales')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(LIMITE_CORRECCIONES)
  if (error) {
    console.error('Error cargando correcciones de Supabase:', error.message)
    return leerAlmacen<CorreccionManual[]>(CLAVES_ALMACEN.correcciones, [])
  }
  return (data as FilaCorreccion[]).map(filaACorreccion)
}

export async function guardarCorreccion(c: CorreccionManual): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    const todas = leerAlmacen<CorreccionManual[]>(CLAVES_ALMACEN.correcciones, [])
    todas.push(c)
    guardarAlmacen(CLAVES_ALMACEN.correcciones, todas.slice(-LIMITE_CORRECCIONES))
    return
  }
  const { error } = await supabase.from('correcciones_manuales').upsert(correccionAFila(c))
  if (error) console.error('Error guardando corrección en Supabase:', error.message)
}

export async function eliminarCorreccionesRemotas(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const uid = await backendUid()
  if (!uid || !supabase) {
    const set = new Set(ids)
    const todas = leerAlmacen<CorreccionManual[]>(CLAVES_ALMACEN.correcciones, [])
    guardarAlmacen(CLAVES_ALMACEN.correcciones, todas.filter(c => !set.has(c.id)))
    return
  }
  const { error } = await supabase.from('correcciones_manuales').delete().in('id', ids)
  if (error) console.error('Error eliminando correcciones en Supabase:', error.message)
}

export async function reemplazarCorrecciones(correcciones: CorreccionManual[]): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) {
    guardarAlmacen(CLAVES_ALMACEN.correcciones, correcciones)
    return
  }
  const { error: errDel } = await supabase.from('correcciones_manuales').delete().eq('local_id', uid)
  if (errDel) console.error('Error limpiando correcciones en Supabase:', errDel.message)
  if (correcciones.length > 0) {
    const { error } = await supabase.from('correcciones_manuales').insert(correcciones.map(correccionAFila))
    if (error) console.error('Error importando correcciones a Supabase:', error.message)
  }
}

// ==================== APRENDIZAJES DERIVADOS (materialización) ====================

/**
 * Resincroniza la tabla aprendizajes_derivados con el set derivado actual.
 * La fuente de verdad son las correcciones; esto materializa el resultado
 * para inspección externa y futuros consumidores server-side.
 */
export async function sincronizarAprendizajes(aprendizajes: AprendizajeDerivado[]): Promise<void> {
  const uid = await backendUid()
  if (!uid || !supabase) return // en modo local se derivan al vuelo, no se materializan
  const { error: errDel } = await supabase.from('aprendizajes_derivados').delete().eq('local_id', uid)
  if (errDel) {
    console.error('Error limpiando aprendizajes en Supabase:', errDel.message)
    return
  }
  if (aprendizajes.length === 0) return
  const filas = aprendizajes.map(a => ({
    colaborador_nombre: a.colaboradorNombre,
    tipo: a.direccion,
    parametros: { dia: a.dia, valor: a.valor, correccionIds: a.correccionIds, descripcion: a.descripcion },
    fuerza: a.evidencias,
  }))
  const { error } = await supabase.from('aprendizajes_derivados').insert(filas)
  if (error) console.error('Error guardando aprendizajes en Supabase:', error.message)
}

// ==================== MIGRACIÓN INICIAL localStorage → Supabase ====================

async function migrarLocalASupabase(): Promise<void> {
  if (!supabase) return
  if (localStorage.getItem(CLAVES_ALMACEN.migrado)) return

  const reglas = leerAlmacen<ReglaConfigurable[]>(CLAVES_ALMACEN.reglas, [])
  const historial = leerAlmacen<SemanaHistorial[]>(CLAVES_ALMACEN.historial, []).map(normalizarSemana)
  const correcciones = leerAlmacen<CorreccionManual[]>(CLAVES_ALMACEN.correcciones, [])

  if (reglas.length === 0 && historial.length === 0 && correcciones.length === 0) {
    localStorage.setItem(CLAVES_ALMACEN.migrado, new Date().toISOString())
    return
  }

  // Solo migrar hacia tablas vacías (no pisar datos remotos existentes)
  const { count } = await supabase
    .from('reglas_configurables')
    .select('id', { count: 'exact', head: true })
  const { count: countSemanas } = await supabase
    .from('semanas_historial')
    .select('id', { count: 'exact', head: true })

  if ((count ?? 0) === 0 && reglas.length > 0) {
    await supabase.from('reglas_configurables').insert(reglas.map(reglaAFila))
  }
  if ((countSemanas ?? 0) === 0 && historial.length > 0) {
    await supabase.from('semanas_historial').insert(historial.map(semanaAFila))
    if (correcciones.length > 0) {
      await supabase.from('correcciones_manuales').insert(correcciones.map(correccionAFila))
    }
  }
  localStorage.setItem(CLAVES_ALMACEN.migrado, new Date().toISOString())
}

// ==================== EXPORT / IMPORT ====================

export interface ExporteConfiguracion {
  formato: 'aliada-backup'
  version: 1
  exportadoEl: string
  reglas: ReglaConfigurable[]
  historial: SemanaHistorial[]
  correcciones: CorreccionManual[]
}

export async function exportarConfiguracion(): Promise<ExporteConfiguracion> {
  const [reglas, historial, correcciones] = await Promise.all([
    cargarReglas(),
    cargarHistorial(),
    cargarCorrecciones(),
  ])
  return {
    formato: 'aliada-backup',
    version: 1,
    exportadoEl: new Date().toISOString(),
    reglas,
    historial,
    correcciones,
  }
}

export function validarExporte(datos: unknown): datos is ExporteConfiguracion {
  if (!datos || typeof datos !== 'object') return false
  const d = datos as Partial<ExporteConfiguracion>
  return (
    d.formato === 'aliada-backup' &&
    Array.isArray(d.reglas) &&
    Array.isArray(d.historial) &&
    Array.isArray(d.correcciones)
  )
}
