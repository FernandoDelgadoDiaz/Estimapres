import { useState } from 'react'
import { extraerNecesidadDesdePDF } from '../utils/pdfParser'
import { Franja } from '../types'

export function usePDFParser() {
  const [necesidad, setNecesidad] = useState<Franja[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsearPDF = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const resultado = await extraerNecesidadDesdePDF(file)
      setNecesidad(resultado)
      return resultado
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido al parsear PDF'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setNecesidad([])
    setError(null)
  }

  return {
    necesidad,
    loading,
    error,
    parsearPDF,
    reset,
  }
}