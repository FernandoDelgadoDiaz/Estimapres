# Plan: de la 091 a todas las sucursales

**Estado:** PROPUESTA, pendiente de aprobación del propietario (21/11/2026). No modifica MASTER hasta que se apruebe.
**Base:** evaluación del 21/11/2026. Como piloto en la 091 la app está sólida, es óptima y segura. Para escalar faltan permisos por sucursal, capacidad del motor, datos compartidos por sucursal, unificación de reglas y monitoreo.

---

## Punto de partida (verificado el 21/11/2026)

| Tema | Hoy | Límite |
|---|---|---|
| Acceso al motor CP-SAT | Un solo usuario y la sucursal 091, fijados en Google (Secret Manager y variables) | No sirve para otra sucursal sin tocar la infraestructura |
| Capacidad del motor | Cloud Run: 1 vCPU, 2 GiB, **máximo 1 instancia, 1 cálculo a la vez**, unos 2 min por horario | Con dos generaciones simultáneas, la segunda recibe «ocupado» y usa el motor de respaldo (A) |
| Datos | Personal, reglas, horarios y correcciones se guardan **por usuario** (`local_id`) | Dos supervisores de la misma sucursal no comparten datos |
| Reglas | Dos sistemas: reglas de la sucursal y configuración del motor (AH2-042) | Duplicación (por ejemplo, máximo de francos en los dos) |
| Habilitación del motor híbrido | Variable de Netlify `VITE_AH2_HIBRIDO_091` | Una sucursal más exige un nuevo deploy |
| Monitoreo | No hay alertas de errores | Las fallas se detectan cuando las ve el usuario |
| Repositorio del motor | Producción corre `4e23804`, que está en `feat/minimo-impacto-semanal` (cadena #1–#5 sin pasar a `main`) | Riesgo de orden y trazabilidad |
| Normativa | Perfil normativo «pendiente de validación jurídica» | Se necesita validación antes de ampliar |

---

## Fases

### Fase 0: uso real en la 091 (2 a 3 semanas, ya)
- El supervisor genera y corrige las semanas reales. Se anotan los ajustes que surjan.
- Se conecta **monitoreo de errores** (Sentry u otro equivalente) en la app y en el motor, con alerta por correo.
- Se guardan **estadísticas de cada generación**, solo internas y sin pantalla: motor elegido, cobertura, tiempo y fases demostradas.
- **Costo:** USD 0 (plan gratuito de Sentry).
- **Listo cuando:** 2 semanas generadas y guardadas sin incidentes graves y los ajustes de uso resueltos.

### Fase 1: datos y permisos por sucursal (lo más importante)
- Se agregan las tablas **`sucursales`** (código, nombre, si el motor híbrido está habilitado y la configuración base) y **`miembros_sucursal`** (usuario, sucursal y rol).
- **Roles:**
  - **Supervisor:** usa y configura su sucursal.
  - **Administrador:** gestiona sucursales, miembros y opciones avanzadas.
  - **Regional (opcional):** consulta varias sucursales sin editarlas.
- Personal, reglas, horarios, correcciones y configuración pasan de «por usuario» a **«por sucursal»**. RLS: cada usuario ve solo las sucursales donde es miembro.
- **Migración con respaldo:** se copian los datos actuales de la 091 a la sucursal 091 y se asigna al propietario como administrador. Se verifica que los números (personal, semanas, reglas) coincidan antes y después. Las columnas viejas se conservan hasta confirmar.
- **Se unifican las reglas** en un solo sistema por sucursal, con historial (el modelo AH2-042). La pantalla de Configuración no cambia para el supervisor.
- Se agrega una pantalla de **Administración** (solo para el rol administrador): sucursales, miembros e invitaciones por correo.
- **Pruebas:** aislamiento entre sucursales (un usuario no ve otra sucursal), migración sobre una copia de los datos y concurrencia.
- **Costo:** USD 0 de infraestructura. Ver la nota sobre el plan de Supabase.
- **Listo cuando:** la 091 funciona igual que hoy sobre el modelo nuevo, y un segundo usuario de prueba de la 091 ve los mismos datos.

### Fase 2: motor para todas las sucursales
- El motor CP-SAT autoriza por **membresía en la base**, no por un usuario fijo en Secret Manager. El JWT de Supabase se sigue verificando como ahora.
- La configuración del motor sale de la base, por sucursal. Secret Manager deja de tener datos operativos.
- El motor híbrido se habilita **por sucursal desde Administración**, sin redeploy.
- **Capacidad:** Cloud Run pasa a **máximo 10 instancias** (ajustable) y sigue en 0 mínimas y 1 cálculo por instancia, así que se paga solo cuando se usa. Si se llega al límite, la generación espera en fila con un aviso («Tu horario está en cola, lo vas a ver en Horarios») en lugar de pasar al motor de respaldo.
- El despliegue del motor queda **automatizado desde `main`**, con imagen etiquetada por versión y rollback en un paso.
- **Listo cuando:** dos sucursales de prueba generan al mismo tiempo, las dos con CP-SAT, sin «ocupado».

### Fase 3: orden y robustez
- Se pasa la cadena aliada-optimizer #1–#5 a `main` y producción queda corriendo desde `main`.
- Se divide la pantalla Nueva semana en componentes más chicos (hoy tiene unas 1.400 líneas), sin cambiar su aspecto.
- Se confirman los **backups** de la base y se prueba una restauración.
- **Validación jurídica:** RR. HH. o legales revisa las reglas laborales del motor (contratos FULL y PART, descansos, francos, horas por día). Lo que surja se incorpora como decisión en MASTER.
- **Listo cuando:** el perfil normativo pasa a «validado».

### Fase 4: piloto ampliado y despliegue por etapas
- **Piloto con 2 o 3 sucursales elegidas por el propietario, durante 3 semanas.** Incluye la carga inicial asistida: importación del personal desde una planilla y la configuración de cada sucursal.
- **Despliegue por etapas:** 10 sucursales, luego 40 y luego las 160. Entre etapa y etapa se revisan errores, tiempos de generación y costos.
- Se escribe una **guía de una página para supervisores**, con capturas.

### Fase 5: diferencial (después de escalar)
- **Simulador de dotación en la app:** «¿Qué pasa si sumo un supervisor, un PART o un FULL?». Muestra la cobertura y las horas sin cubrir antes de contratar, como la simulación hecha para la 091 (88 % → 97,5 % con un supervisor más).
- **Panel regional:** cobertura y horas sin cubrir de todas las sucursales de una zona.

---

## Costo estimado de Google Cloud (Cloud Run, motor CP-SAT)

Supuesto: 1 vCPU y 2 GiB por generación, unos 125 s cada una. Precios de lista de southamerica-east1, con el nivel gratuito mensual de la cuenta (180.000 vCPU-s y 360.000 GiB-s).

| Escenario | Generaciones por mes | Uso | Costo mensual aproximado |
|---|---|---|---|
| Hoy (091) | unas 15 | dentro del nivel gratuito | **USD 0** |
| Piloto (3 sucursales) | unas 50 | dentro del nivel gratuito | **USD 0** |
| 160 sucursales, 3 generaciones por semana | unas 2.100 | 260.000 vCPU-s y 520.000 GiB-s | **USD 3 a 5** |
| 160 sucursales, 6 generaciones por semana | unas 4.200 | 520.000 vCPU-s y 1.040.000 GiB-s | **USD 15 a 20** |

- Con 0 instancias mínimas no hay costo fijo: se paga solo cuando alguien genera.
- Artifact Registry (imágenes) y Cloud Build tienen costo nulo o de centavos.
- Se puede fijar una **alerta de presupuesto** (por ejemplo, USD 30 por mes) en Google Cloud.

**Otros servicios:**
- **Supabase:** si el proyecto está en el plan gratuito, para producción con varias sucursales conviene el plan Pro (unos USD 25 por mes), que incluye backups diarios y no pausa el proyecto por inactividad. Hay que confirmar en qué plan está.
- **Netlify:** sin cambios.
- **Monitoreo:** el plan gratuito alcanza al principio.

---

## Decisiones del propietario

1. **Aprobar el plan** y el orden de las fases.
2. **Sucursales piloto** de la fase 4 (2 o 3).
3. **Roles:** si se necesita el rol regional, o alcanza con supervisor y administrador.
4. **Supabase:** confirmar el plan actual y si se pasa a Pro.
5. **Presupuesto máximo** de Google Cloud y alerta, por ejemplo USD 30 por mes.
6. **Validación jurídica:** quién revisa las reglas laborales.

## Reglas de ejecución (como hasta ahora)
- Cada fase va en sus propios PR, con pruebas, CI y rollback documentado.
- Las migraciones, despliegues, gastos y cambios de producción se hacen solo con autorización expresa.
- Los datos personales nunca van a GitHub.
- MASTER y CURRENT_WORK se actualizan al cerrar cada fase.
