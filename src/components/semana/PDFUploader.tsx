import { useRef, useState } from 'react'

interface PDFUploaderProps {
  onFileSelect: (file: File) => Promise<void>
  loading: boolean
  error: string | null
}

export default function PDFUploader({ onFileSelect, loading, error }: PDFUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      await onFileSelect(file)
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      await onFileSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-6xl mb-4">📄</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          Arrastra tu PDF aquí
        </h3>
        <p className="text-gray-600 mb-4">
          O haz clic para seleccionar el archivo con el "Estimado de cajas necesarias"
        </p>
        <p className="text-sm text-gray-500 mb-6">
          El archivo debe contener la tabla semanal de necesidad de cajas (formato estándar).
        </p>
        <button
          type="button"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-flex items-center"
          disabled={loading}
        >
          {loading ? 'Procesando...' : 'Seleccionar PDF'}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={loading}
        />
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">❌</span>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-gray-800 mb-2">Requisitos del PDF</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Debe contener la tabla titulada "Estimado de cajas necesarias"</li>
          <li>• Formato: primera fila "Horario" seguida de 7 fechas (MM-DD)</li>
          <li>• Filas: HH:MM:SS seguido de 7 números (cajas necesarias)</li>
          <li>• Horario cubierto: 07:00 a 22:00 cada 30 minutos</li>
          <li>• El sistema buscará automáticamente la tabla en cualquier página</li>
        </ul>
      </div>
    </div>
  )
}