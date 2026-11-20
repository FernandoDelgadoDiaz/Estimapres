# Ejecución de CP-SAT junto a Netlify y Supabase: propuesta (sin contratar)

**20/11/2026 · Claude.** No se contrató, creó ni configuró ningún servicio. Los precios son **aproximados**, tomados de las tarifas públicas conocidas. Hay que **verificarlos en la calculadora oficial** antes de decidir.

## 1. Restricciones técnicas

**Lo que necesita B:**
- Python 3.12 con OR-Tools 9.15, que es una librería nativa de unos 30–60 MB.
- Una CPU y 1–2 GiB de memoria.
- Tiempo de resolución medido en laboratorio:
  - 7 personas: 4 s con OPTIMAL;
  - corridas de AH2-040: hasta 1,25 s por modo;
  - dotación grande sintética (12 personas): 8–9 s.
  - Para la 091 (≈ 20–40 personas) se recomienda un presupuesto de **30 s** y un límite duro de 60 s.

**Lo que hoy existe:**
- Netlify sirve el front estático y las Functions en JS/TS.
- Supabase aporta autenticación, Postgres y Edge Functions en Deno.

| Opción | ¿Corre OR-Tools Python? | Límite de tiempo | Conclusión |
|---|---|---|---|
| Netlify Functions | No: el runtime es JS/TS/Go, no Python. | Síncronas ~10 s (hasta ~26 s según el plan); en segundo plano ~15 min según el plan. | No sirve para ejecutar B. **Sí sirve** como puerta autenticada o encoladora. |
| Supabase Edge Functions | No: es Deno, sin librerías nativas Python. | ~150 s en plan gratuito. | No sirve para B. |
| Navegador (WebAssembly) | No hay versión mantenida de CP-SAT para el navegador. | — | Descartado. |
| **Google Cloud Run (contenedor)** | Sí: imagen Python + OR-Tools. | Hasta 60 min por solicitud; respuesta en streaming soportada. | **Recomendada.** |
| AWS Lambda con imagen de contenedor | Sí. | 15 min. | Alternativa equivalente: más configuración IAM y otra cuenta de nube. |
| Fly.io / Render / Railway | Sí. | Sin límite práctico. | Viable, pero cobra por máquina encendida o por mínimo mensual. |

## 2. Recomendación: Cloud Run con escalado a cero y autenticación Supabase

```
Navegador (supervisor autenticado en Supabase)
   │  POST sobre aliada-hibrido/1 + JWT de Supabase  (NDJSON con progreso)
   ▼
Cloud Run «aliada-optimizer» (southamerica-east1, mín. 0 / máx. 2 instancias, concurrencia 1)
   - verifica el JWT de Supabase (JWKS/secret), el rol de supervisor y la sucursal del sobre
   - valida el sobre (tamaño ≤ 2 MB, versión, hash) y ejecuta `optimizer.contrato` en un proceso aislado
   - responde por streaming el progreso real por fase y la respuesta final; no escribe en disco
   ▼
Navegador: el orquestador valida con A, selecciona y muestra. A sigue siendo el respaldo ante cualquier fallo.
```

**Por qué esta opción:**
- **Costo casi nulo con el volumen de la 091.** Escala a cero: sin corridas no hay costo de cómputo.
- **Sin cambiar Netlify ni Supabase:**
  - el front sigue en Netlify;
  - la identidad sigue en Supabase;
  - la verificación del JWT se hace en el servicio, sin migraciones;
  - el mismo contrato y el mismo transporte NDJSON del laboratorio (`transporteHttpLab`) se reutilizan apuntando a la URL del servicio.
- **Tiempos de ejecución:**
  - el arranque en frío de un contenedor Python con OR-Tools ronda 2–5 s (**medir**);
  - la resolución, 5–30 s según la dotación;
  - el progreso por fase llega en vivo, así que el supervisor no ve una espera muda.

### 2.1 Costos estimados (verificar antes de contratar)

Una corrida típica usa 2 vCPU y 2 GiB durante 30 s: **60 vCPU·s y 60 GiB·s**. Con 50 corridas por mes (091: varias pruebas por semana) se consumen 3.000 vCPU·s y 3.000 GiB·s.

| Concepto | Valor aproximado |
|---|---|
| Nivel gratuito mensual de Cloud Run (facturación por solicitud) | ~180.000 vCPU·s, ~360.000 GiB·s y 2 millones de solicitudes |
| Uso de 50 corridas por mes | **dentro del nivel gratuito: ≈ USD 0** |
| Costo por corrida fuera del nivel gratuito | ≈ USD 0,002–0,004, según la región (São Paulo es más cara que us-central1) |
| Escala a 50 sucursales × 20 corridas por mes (60.000 vCPU·s) | sigue cerca del nivel gratuito; en el peor caso, unos pocos USD por mes |
| Artifact Registry (imagen de ~0,5–1 GB) | ≈ USD 0,05–0,10 por mes |
| Salida de red | despreciable: respuestas JSON de algunos KB |

**Alternativas:**
- Fly.io con apagado automático: unos pocos USD por mes.
- Render o Railway encendidos: ≈ USD 5–7 por mes como mínimo.
- AWS Lambda: comparable a Cloud Run, pero con otra cuenta de nube.

### 2.2 Seguridad

| Aspecto | Medida |
|---|---|
| **Autenticación** | JWT de Supabase obligatorio, verificado con el secreto o JWKS del proyecto. Se rechaza un token vencido o un rol que no sea supervisor. La `sucursal_id` del sobre debe estar entre las sucursales del usuario (claims o consulta de solo lectura con RLS). |
| **Autorización de red** | El servicio es público solo para HTTPS. Opcionalmente, Cloud Armor o un límite de solicitudes por usuario. |
| **CORS** | Solo el dominio de Netlify de la aplicación. |
| **Datos** | Sin persistencia ni disco en el servicio. Los registros contienen **solo** el hash del sobre, la duración y el estado: nunca nombres ni horarios. |
| **Límites** | Sobre ≤ 2 MB; 120 s máximos de CP-SAT; concurrencia 1 por instancia; máximo de instancias acotado (control de costo). |
| **Secretos** | Secret Manager (secreto JWT de Supabase), nunca en el repositorio. Un service account sin permisos de datos. |
| **Ubicación** | Región southamerica-east1 (São Paulo) por latencia y localización de datos. |
| **Integridad** | El hash canónico del sobre se verifica en B. La respuesta se valida en A. **Ningún resultado de B se usa sin pasar por los validadores de A.** |

### 2.3 Escalabilidad

- Concurrencia 1 por instancia: CP-SAT usa un worker y se reproduce con la semilla.
- El escalado horizontal se limita con el máximo de instancias.
- Si en el futuro hubiera picos, por ejemplo todas las sucursales el mismo día, el siguiente paso es una cola. Puede ser Cloud Tasks, o una tabla en Supabase, que requiere una migración autorizada. El sobre y el contrato no cambian.
- El orquestador ya tolera timeout, caída y respuesta inválida, usando A como respaldo.

## 3. Pasos para habilitarlo (requieren autorización del propietario)

1. Crear el proyecto de Google Cloud con facturación y alertas de presupuesto (por ejemplo, USD 5).
2. Agregar a aliada-optimizer un `Dockerfile` y un servidor HTTP mínimo que envuelva `optimizer.contrato` con progreso NDJSON y verificación del JWT.
3. Desplegar en Cloud Run con mínimo 0 y máximo 2 instancias, 2 vCPU, 2 GiB y timeout de 120 s.
4. En Estimapres, configurar la URL del servicio y usar `transporteHttpLab` con encabezado `Authorization` dentro del flujo **de laboratorio**, todavía sin publicación.
5. Repetir la prueba integral contra el servicio. Medir arranque en frío, tiempo por corrida y costo real del primer mes.
