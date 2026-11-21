import { Colaborador } from '../../types'

interface TablaColaboradoresProps {
  colaboradores: Colaborador[]
  onEdit: (colaborador: Colaborador) => void
  onDelete: (id: string) => void
  onToggleActivo: (id: string) => void
}

export default function TablaColaboradores({
  colaboradores,
  onEdit,
  onDelete,
  onToggleActivo,
}: TablaColaboradoresProps) {
  const tiposColor = {
    FULL: 'bg-blue-100 text-blue-800',
    PART: 'bg-green-100 text-green-800',
    AUX: 'bg-purple-100 text-purple-800',
  }

  return (
    <div className="tabla-contenedor">
      <table className="tabla-grilla">
        <colgroup>
          <col /><col style={{ width: '110px' }} /><col style={{ width: '170px' }} /><col style={{ width: '120px' }} /><col style={{ width: '260px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Nombre</th>
            <th className="centro">Tipo</th>
            <th className="centro">Horas semanales</th>
            <th className="centro">Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {colaboradores.map((col) => (
            <tr key={col.id} style={{ opacity: col.activo ? 1 : 0.6 }}>
              <td style={{ fontWeight: 600 }}>{col.nombre}</td>
              <td className="centro">
                <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${tiposColor[col.tipo]}`}>{col.tipo}</span>
              </td>
              <td className="centro num">{col.horasSemanales !== undefined ? `${col.horasSemanales} h` : 'Sin dato'}</td>
              <td className="centro">
                <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${col.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {col.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td>
                <div className="flex gap-4">
                  <button onClick={() => onEdit(col)} className="font-semibold underline" style={{ color: 'var(--text)' }}>Editar</button>
                  <button onClick={() => onToggleActivo(col.id)} className="underline" style={{ color: 'var(--text-muted)' }}>{col.activo ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => onDelete(col.id)} className="underline" style={{ color: 'var(--danger)' }}>Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
