// AH2 · Tramo B1 — Errores tipados del núcleo de planificación.
// Todas las funciones del núcleo devuelven un Resultado: nunca lanzan por reglas de negocio.
// Los mensajes describen validez TÉCNICA y reglas de flujo; nunca afirman conformidad
// jurídica (AH2-033, invariante I13).

export type CodigoError =
  // Fechas y ciclos
  | 'FECHA_INVALIDA'
  | 'INICIO_NO_LUNES'
  | 'FIN_NO_DOMINGO'
  | 'DURACION_INVALIDA'
  | 'CICLO_INVERTIDO'
  | 'SUPERPOSICION_CICLOS'
  | 'HUECO_ENTRE_CICLOS'
  | 'SUCURSAL_DISTINTA'
  | 'ID_DUPLICADO'
  | 'ID_INVALIDO'
  // Máquina de estados
  | 'TRANSICION_INVALIDA'
  | 'ACTOR_NO_HUMANO'
  | 'ROL_NO_AUTORIZADO'
  | 'APROBACION_PROPIA_NO_PERMITIDA'
  | 'VALIDACION_NO_SUPERADA'
  | 'VALIDACION_CADUCADA'
  | 'VALIDACION_SIN_HUELLA'
  | 'PUBLICACION_LOCAL_PROHIBIDA'
  | 'PUBLICACION_SIN_REVALIDACION_SERVIDOR'
  | 'PUBLICADO_INMUTABLE'
  | 'LEGADO_NO_PUBLICABLE'
  // Vigencia
  | 'CONFLICTO_CONCURRENCIA'
  | 'FECHA_NO_FUTURA'
  | 'TRAMO_INVERTIDO'
  | 'TRAMOS_NUEVOS_SOLAPADOS'
  | 'SOLAPAMIENTO_VIGENCIA'
  | 'TRAMO_SIN_VERSION_PUBLICADA'
  | 'SEMANA_VERSION_INCONSISTENTE'
  | 'DIAS_CONGELADOS_MODIFICADOS'
  // Huellas
  | 'VALOR_NO_SERIALIZABLE'

export interface ErrorPlanificacion {
  codigo: CodigoError
  mensaje: string
  /** Datos estructurados para la UI, pruebas y auditoría (ids, fechas…). */
  detalle?: Record<string, unknown>
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: ErrorPlanificacion[] }

export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor })
export const falla = <T = never>(codigo: CodigoError, mensaje: string, detalle?: Record<string, unknown>): Resultado<T> =>
  ({ ok: false, errores: [{ codigo, mensaje, ...(detalle ? { detalle } : {}) }] })
export const fallas = <T = never>(errores: ErrorPlanificacion[]): Resultado<T> => ({ ok: false, errores })
