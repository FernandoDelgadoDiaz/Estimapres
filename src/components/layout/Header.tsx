import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Header() {
  const hoy = new Date()
  const semanaActual = `Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'yyyy', { locale: es })}`

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Aliada Horarios</h2>
          <p className="text-sm text-gray-600">{semanaActual}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">Aliada Tech</p>
            <p className="text-xs text-gray-500">Sucursal Central</p>
          </div>
          <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-bold">SC</span>
          </div>
        </div>
      </div>
    </header>
  )
}