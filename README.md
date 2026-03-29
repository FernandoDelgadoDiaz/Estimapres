# Aliada Horarios - Asignador de Horarios de Cajeros

Aplicación web para asignación automática de horarios semanales de cajeros en supermercados.

## Características

- **Extracción automática de PDF**: Lee el "Estimado de cajas necesarias" de un PDF semanal.
- **Gestión de colaboradores**: CRUD completo de cajeros (FULL, PART, AUX) con persistencia en localStorage.
- **Algoritmo inteligente**: Asigna turnos respetando todas las reglas de negocio:
  - Prioridad: FULL → PART → AUX
  - Distribución fija para FULL: 3×9h + 2×8h + 1×5h
  - PART: máximo 32h, solo turno corrido
  - Descanso mínimo de 12h entre jornadas
  - 1 franco obligatorio por semana
- **Visualización completa**: Tablas de cobertura, horarios por colaborador, alertas y métricas.
- **Exportación a PDF**: Genera un informe profesional con los horarios asignados.

## Tecnologías

- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS (estilos)
- React Router v6 (navegación)
- pdfjs-dist (extracción de PDF en cliente)
- jspdf + jspdf-autotable (exportación PDF)
- Zustand (gestión de estado)
- date-fns (manipulación de fechas)

## Instalación y ejecución

1. **Clonar el repositorio** (si aplica)
2. **Instalar dependencias**:
   ```bash
   npm install
   ```
3. **Ejecutar en desarrollo**:
   ```bash
   npm run dev
   ```
4. **Abrir en navegador**: http://localhost:5173

## Uso

### 1. Gestionar colaboradores
- Navega a **Colaboradores** en el sidebar.
- Agrega, edita o desactiva cajeros.
- Los datos se guardan automáticamente en localStorage.

### 2. Generar horarios semanales
- Navega a **Nueva Semana**.
- Sube el PDF con la tabla "Estimado de cajas necesarias".
- Revisa los datos extraídos y los colaboradores activos.
- Haz clic en **Generar horarios**.
- Revisa el resultado, alertas y métricas.
- Exporta a PDF si todo está correcto.

### Formato del PDF
El PDF debe contener una tabla con el siguiente formato:
```
Estimado de cajas necesarias
Horario  03-30  03-31  04-01  04-02  04-03  04-04  04-05
07:00:00   0      0      0      0      0      0      0
07:30:00   0      0      0      0      0      0      0
... (franjas cada 30 min hasta 22:00)
```

## Estructura del proyecto

```
src/
├── components/           # Componentes React
│   ├── layout/          # Layout principal
│   ├── colaboradores/   # Gestión de colaboradores
│   └── semana/          # Componentes del flujo semanal
├── pages/               # Páginas principales
├── hooks/               # Hooks personalizados
├── utils/               # Utilidades (algoritmo, PDF, etc.)
└── types/               # Tipos TypeScript
```

## Reglas de negocio implementadas

### Para FULL Time (48h semanales)
- 6 días de trabajo, 1 franco
- Distribución exacta: 3 jornadas de 9h + 2 de 8h + 1 de 5h
- Pueden tener turno corrido o cortado (2 bloques)
- Si es cortado: mínimo 3h de descanso entre bloques

### Para PART Time (hasta 32h semanales)
- 6 días de trabajo, 1 franco
- Solo turno corrido (sin cortes)
- Máximo 32h semanales (pueden extenderse desde horas contractuales)

### Para AUX (Auxiliar Supervisor)
- Mismas reglas que FULL
- Se usan solo si FULL + PART no cubren la necesidad

### Reglas generales
- Unidad mínima: 30 minutos
- Descanso mínimo de 12h entre fin de una jornada e inicio de la siguiente
- 1 franco obligatorio por semana (día completo libre)

## Limitaciones y mejoras futuras

- **Sin backend**: Todo corre en el navegador, los datos no se sincronizan entre dispositivos.
- **PDF parsing**: Depende del formato exacto de la tabla.
- **Algoritmo**: La versión actual es una demostración; puede mejorarse con optimización más fina.
- **Historial**: Funcionalidad pendiente de implementación.

## Licencia

MIT