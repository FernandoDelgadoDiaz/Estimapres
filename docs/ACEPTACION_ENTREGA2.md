# Aceptación de Aliada Horarios 2.0 · Entrega 2

**12 de noviembre de 2026 · Resultado técnico conforme para revisión del propietario.**

**Candidato funcional verificado:** `195276af0361222824a25d2fa7d156a8289c5be7` en `release/ah2-f1`, [PR #30](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/30).

**Comparación:** release anterior `11650278b09037054dcbd2432bab47ce685c27e0`. `main` continúa en `8aa104db17f87250661d7e2348af1190e9806759`.

## Validación técnica

Los PR [#32](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/32) y [#33](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/33) se fusionaron en `release/ah2-f1`, en ese orden. GitHub integró ambos sin conflictos. Se verificaron por SHA los 21 archivos modificados o agregados, incluidos los dos compartidos, `docs/CURRENT_WORK.md` y `src/pages/NuevaSemanaPage.tsx`.

| Control | Resultado |
|---|---|
| Node 22.23.5 · `npm ci --no-audit --no-fund` | Instalación limpia, 347 paquetes. |
| `npm test` | 189 aprobadas y 1 omitida. La omitida requiere un POM real en local. |
| `npx tsc --noEmit` y `npm run build` | Ambos correctos. |
| Chromium / Playwright sobre el build compilado | 4/4. PDF sintético de tres páginas, 31 franjas, 406 horas-caja, pico de 7 cajas, horario nominal, validación y descarga. Incluye flujo habitual, excepción eventual, huecos de AUX y recarga. |
| PDF A4 | La suite reabrió los casos de 25, 40 y 60 personas y verificó tamaño, nombres, tipos, horas, siete días, cortes y anexos. Conserva la revisión visual previa de #32. |
| GitHub Actions sobre el commit de integración | [test-build](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43317272298/job/131528472536) y [browser](https://github.com/FernandoDelgadoDiaz/Estimapres/actions/runs/43317272298/job/131528472955) exitosos. El commit posterior de documentación conserva el mismo código. |

### Comparación de horarios

Se ejecutó el motor en ambas revisiones con entradas idénticas. Se compararon por hash jornadas, asignaciones, métricas y reporte de reglas, excluyendo las fechas internas inicializadas con el reloj. Se comparó también la salida nominal del adaptador. Todos los datos son sintéticos.

| Escenario | Motor | Salida nominal | Horas-caja faltantes |
|---|---|---|---:|
| Patrón habitual | Idéntico | Idéntica | 30,5 |
| Patrón habitual con reglas y demanda elevada | Idéntico | Idéntica | 307 |
| Disponibilidad efectiva con excepción de eventual | Idéntico | Idéntica | 312,5 |
| Hueco de supervisión en apertura | Idéntico | El candidato muestra la presencia nominal de 3 AUX. Caja de AUX queda en 0 en ambas versiones. | 47,5 |

Los turnos de cajeros y eventuales, la cobertura y las alertas del motor coincidieron en los cuatro escenarios. Playwright verificó que la excepción se aplica por fecha y que un hueco de supervisión deja el resultado como **BORRADOR**. La comparación usa el release anterior como base. Frente al `main` productivo, #20 ya incorporaba el cambio deliberado a 12 horas reales de descanso.

### Pendientes técnicos para producción

- El propietario debe revisar el [PR #30](https://github.com/FernandoDelgadoDiaz/Estimapres/pull/30) y decidir su integración y la publicación en Netlify. Ambos sitios productivos deben verificarse después de una publicación autorizada.
- Antes de usar el flujo como publicación oficial de horarios, quedan pendientes los estados persistidos de aprobación y publicación, su bloqueo y la trazabilidad de POM y reglas. Las excepciones por fecha viven en memoria de la pantalla. Cualquier cambio en el esquema o los datos requiere autorización. [#12](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/12) · [#28](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/28)
- Continúan abiertos el aislamiento de tablas de Supabase señalado en #5 y la decisión sobre datos históricos del repositorio en #23. Su estado de infraestructura quedó fuera de esta verificación. [#5](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/5) · [#23](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/23)

## Validación laboral y operativa pendiente

- Confirmar con el responsable de la sucursal y el asesor laboral el convenio y el perfil aplicable. Resolver D1–D3 sobre horas FULL/PART y francos, y D4 sobre el horario de cierre de la sucursal. Revisar también la política de supervisión, disponibilidad y planificación automática de AUX y eventuales, AUX-D1–D4. [MASTER §3 y §9](ALIADA_HORARIOS_MASTER.md) · [#7](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/7) · [#28](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/28)
- El estado **VALIDADO** acredita que el horario pasó las comprobaciones del perfil implementado. La validación jurídica de ese perfil y la autorización operativa siguen pendientes.

## Validación del POM real pendiente

1. Ejecutar `POM_PDF="/ruta/al/archivo.pdf" npx vitest run pom-real.local` con el PDF original en un equipo local. Confirmar semana, 31 franjas por siete días, totales, picos y avisos contra el cuadro «Estimado de cajas necesarias». Para el documento de referencia del 16 al 22 de noviembre, la expectativa documentada es 406 horas-caja y un pico de 7 el sábado.
2. Probar el flujo con la dotación y las reglas vigentes de la sucursal en un entorno aislado de Supabase operativo. Revisar faltantes y el PDF impreso. Registrar solo métricas agregadas y discrepancias de formato. [#8](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/8) · [#12](https://github.com/FernandoDelgadoDiaz/Estimapres/issues/12)

La consolidación usó datos sintéticos, sin consultas ni escrituras en Supabase, migraciones ni despliegues productivos.
