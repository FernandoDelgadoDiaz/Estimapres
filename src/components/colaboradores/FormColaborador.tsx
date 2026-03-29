import { useState } from 'react'
import { Colaborador } from '../../types'

interface FormColaboradorProps {
  colaborador?: Colaborador | null
  onSubmit: (data: Omit<Colaborador, 'id' | 'activo'>) => void
  onCancel: () => void
}

export default function FormColaborador({
  colaborador,
  onSubmit,
  onCancel,
}: FormColaboradorProps) {
  const [nombre, setNombre] = useState(colaborador?.nombre || '')
  const [tipo, setTipo] = useState<Colaborador['tipo']>(colaborador?.tipo || 'FULL')
  const [horasSemanales, setHorasSemanales] = useState(
    colaborador?.horasSemanales.toString() || '48'
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      nombre,
      tipo,
      horasSemanales: parseInt(horasSemanales, 10),
    })
  }

  const tipos = [
    { value: 'FULL', label: 'Full Time (48h)', defaultHours: 48 },
    { value: 'PART', label: 'Part Time (30-32h)', defaultHours: 30 },
    { value: 'AUX', label: 'Auxiliar Supervisor (48h)', defaultHours: 48 },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {colaborador ? 'Editar Colaborador' : 'Agregar Colaborador'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: Carlos Paz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de colaborador
                </label>
                <select
                  value={tipo}
                  onChange={(e) => {
                    const newTipo = e.target.value as Colaborador['tipo']
                    setTipo(newTipo)
                    const tipoObj = tipos.find(t => t.value === newTipo)
                    if (tipoObj) {
                      setHorasSemanales(tipoObj.defaultHours.toString())
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {tipos.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Horas semanales contractuales
                </label>
                <input
                  type="number"
                  required
                  min={20}
                  max={48}
                  step={1}
                  value={horasSemanales}
                  onChange={(e) => setHorasSemanales(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  FULL y AUX: 48h | PART: 30-32h
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {colaborador ? 'Guardar cambios' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}