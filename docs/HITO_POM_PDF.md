# Próximo hito — demostrar POM PDF → horarios nominales → validación → PDF profesional

**Objetivo (AH2-008):** con el POM real del 16–22/11/2026 y la dotación vigente de la sucursal 091, el supervisor sube el PDF, obtiene el cronograma nominal validado y exporta un PDF profesional, **sin carga manual rutinaria** y **sin publicar datos de empleados** fuera de la propia app.
**Estado:** informe de Claude, 2026-11-12. Verificable en GitHub (PR #24 y documentos citados).

## 1. Qué ya está demostrado (con datos sintéticos)
Sobre `integracion/ah2-f1-demo` (PR #24, ⛔ no integrar), con Playwright y un POM **sintético** (31×7, 406 horas-caja):
1. Subir PDF → «Semana: 2026-11-16 al 2026-11-22 (detectada en el PDF)» (#17).
2. Matriz «Estimado de cajas necesarias» validada estrictamente (#17).
3. Generar → cronograma nominal FULL/PART + AUX/eventuales en caja, con 12 h reales de descanso (#20).
4. Validación independiente → «✅ VALIDADO… faltantes 26.5 · sobrantes 1.5 horas-caja» (#19, #21).
5. Exportar → PDF con «Sucursal 091 · Semana 16/11/2026 al 22/11/2026», estado y anexo «Validación y faltantes»; releído con pdf.js (#21).
6. Cero llamadas a IA (#15).

## 2. Qué falta para demostrarlo con el POM real y la dotación vigente

| # | Falta | Tipo | Responsable | Cómo, sin exponer datos |
|---|---|---|---|---|
| 1 | Confirmar que el PDF real cumple el contrato (maquetación del texto no verificada) | Verificación | Propietario (local) | `POM_PDF="/ruta.pdf" npx vitest run pom-real.local` en la rama de #17 o #24: imprime solo semana, horas-caja por día, máximo y avisos. Esperado: semana 16–22/11, **406 horas-caja**, pico 7 sáb 19:30–21:00. Si falla, compartir **solo el mensaje de error** en #8. |
| 2 | Dotación de noviembre cargada y vigente en Supabase (la constatada era de julio) | Dato operativo | Propietario / supervisor | Revisar en la pantalla Colaboradores (FULL/PART/AUX/eventuales, activos). No requiere código. |
| 3 | **Horarios de AUX y disponibilidad de eventuales**: hoy son un patrón fijo cargado a mano en Colaboradores; el motor no los planifica | **Brecha de producto vs AH2-008** | Decisión del propietario | ¿Cambian cada semana? Si sí: o se extraen de la página 1 del POM (programación de referencia, con nombres → solo dentro de la app), o se incorporan al optimizador. Registrar decisión en MASTER. |
| 4 | Reglas vigentes de esa semana (francos fijos, mínimos, tope) cargadas | Dato operativo | Supervisor | Pantalla Reglas (modelo actual; #22 agrega vigencia/prioridad cuando se conecte). |
| 5 | Código integrado disponible para probar | Autorización | Propietario | Opción A: **preview de PR #24** (sin producción; ver advertencia de datos abajo). Opción B: integrar lotes 1–3 de `docs/INTEGRACION_F1.md`. |
| 6 | Cierre de la sucursal (D4: 22:30 o 23:00) | Decisión | Propietario | Hoy se usa la grilla del POM (última fila 22:00–22:30) y el motor puede terminar jornadas a las 23:00. |
| 7 | Validez jurídica del perfil (D1–D3) | Decisión | Propietario + asesor | El PDF lo indica: «perfil normativo pendiente de validación jurídica». Suficiente para demostración, no para publicación oficial. |
| 8 | Aprobación y versión formales (BORRADOR → PUBLICADO, hash de POM/reglas) | Migración | Autorización | Parte pendiente de #12. Para la demo alcanza el estado VALIDADO/BORRADOR. |
| 9 | PDF con roster grande (cortes de página) | Prueba | Claude/Astra | Probar con 25+ colaboradores sintéticos en #12. |
| 10 | Comparación contra la programación de referencia del POM (cobertura y tiempo ahorrado) | Métrica | Futuro | Criterio de éxito del MASTER §8; no bloquea la demo. |

## 3. Recorrido de demostración propuesto (cuando 1, 2 y 5 estén listos)
1. Abrir el preview (o producción tras lotes 1–3) con la sesión de la sucursal 091.
2. Nueva semana → subir el PDF POM real → verificar semana 16–22/11 y matriz.
3. Generar → revisar estado de validación y faltantes; editar si hace falta (se revalida sola).
4. Exportar PDF → revisar encabezado, grilla nominal, francos, horas, anexo.
5. Registrar en #12 **solo** métricas agregadas (cobertura %, horas-caja faltantes/sobrantes, violaciones = 0, minutos invertidos). **Nunca** nombres, horarios individuales ni el PDF.

## 4. Advertencias
- **Datos reales en el preview:** si el preview tiene las variables de Supabase, generar una semana **escribe historial real** (`semanas_historial`). Aceptarlo explícitamente o probar en modo local.
- **Seguridad:** hasta el lote 0 de `docs/INTEGRACION_F1.md`, producción y deploys antiguos exponen el proxy de Anthropic.
- **Privacidad:** ver #23 (nombres de ejemplo en el repo público).
