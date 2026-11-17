# Antecedente dominical y modo prueba

1. Cargar el POM y verificar el lunes de destino.
2. Seleccionar, para cada FULL/PART activo, la última salida programada del domingo anterior o Franco. Confirmar la lista. Para importar JSON se requieren: `sucursal`, `lunes`, `domingo` y `finPorId` (ID estable → hora HH:MM o null para franco). Mantener el archivo fuera de GitHub.
3. Generar con Modo prueba para trabajar sin guardar ni registrar correcciones. La generación sin antecedente deja el descanso intersemanal sin verificar. La generación operativa requiere confirmar los datos y superar la validación.
4. AUX y eventuales conservan sus patrones y sus excepciones por fecha. Al reabrir una semana guardada, se revalida el antecedente registrado. Un horario histórico sin ese respaldo no acredita el descanso intersemanal.

Una salida programada se usa como restricción de planificación. Volver a verificarla si cambia lo efectivamente trabajado. La V8 y la V9 permanecen intactas y no se utilizan como antecedente automático.
