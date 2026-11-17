# Aliada — antecedente dominical explícito y prueba sin persistencia

## Motivo

En sucursal 091, las versiones V8/V9 de la semana 16–22/11/2026 son simulaciones, **no jornadas operadas**. La generación del 23–29/11 no debe asumir que su domingo es el último turno operativo. Por otro lado, la pantalla anterior guardaba automáticamente toda generación, incluso pruebas.

## Implementación

- La pantalla «Nueva Semana» permite importar un JSON local con fecha de domingo y lunes y una salida confirmada (o `null` si franco) por **cada FULL/PART activo**. No incluye AUX ni eventuales. No guarda el archivo en Supabase ni en localStorage.
- El archivo debe corresponder al domingo inmediatamente anterior al lunes de la POM; se rechazan registros incompletos, personas ajenas a la dotación o salidas que no estén en intervalos de 30 min.
- El validador independiente usa ese domingo al evaluar el descanso mínimo entre domingo y lunes. La pasada 1 también excluye candidatos de lunes con entradas prematuras, no solo los marca después.
- Si no se aporta el domingo, **no se asume V9**. Se puede confirmar explícitamente que la semana anterior guardada es operativa. De otro modo el resultado se marca `SIN VERIFICAR` por ausencia de antecedente.
- El modo prueba es **predeterminado** y no registra horarios ni correcciones; el PDF lo identifica como `PRUEBA NO GUARDADA`. Solo cuando se desmarca, se aporta un antecedente y el resultado supera la validación independiente, se guarda la generación.
- Con domingo explícito, la generación no utiliza las preferencias/rotación aprendidas de semanas guardadas que podrían ser pruebas. No se alteran datos históricos ni los horarios de AUX/eventuales.

## Alcance y límites

- El archivo del domingo **22/11** describe una **programación prevista**, no turnos ya trabajados. Validará la planificación del lunes 23, sin afirmar que el domingo haya ocurrido.
- La ausencia del domingo real del **15/11** sigue impidiendo acreditar históricamente el descanso del lunes 16 en V9. La prueba A/B de PR #52 no depende de esta funcionalidad.
- El PR es independiente de #52 y puede revisarse en paralelo. No fusionar ni desplegar sin autorización.
- Esta mejora NO cambia reglas laborales, contratos, esquema SQL ni el algoritmo de cobertura del cierre.

## Ejemplo de archivo (solo IDs de prueba)

```json
{
  "lunes": "2026-11-23",
  "domingo": "2026-11-22",
  "finPorId": {
    "id-full-de-ejemplo": "22:00",
    "id-part-de-ejemplo": null
  }
}
```

En uso real, `finPorId` debe contener **exactamente todos** los IDs FULL/PART activos del local; el ejemplo intencionalmente no pasa esa condición.

## Control de publicación

Rama `feat/ah2-domingo-real-modo-prueba`, base `main` SHA `a7006e48476226976d8b698881ac5274eb568a7d`. No modificar producción, Prestify ni tablas de Supabase. Verificar CI (Vitest, TypeScript/build, Playwright) y prueba manual con JSON de domingo 22 antes de solicitar fusión.
