## PUNTO ÚNICO DE RETOMA — motor híbrido dentro de Aliada Horarios existente · 20/11/2026

**Orden vigente del propietario:** cancelar el piloto independiente, reutilizar lo validado e integrar en Horarios; primera activación 091, generador anterior como respaldo, publicación controlada con rollback. Sin otra app, cambios Prestify ni gastos. MASTER AH2-041. No retomar instalaciones de Render ni otro sitio piloto.

### Candidato de publicación

- Rama activa: `feat/ah2-hibrido-integrado-091`, creada desde `main` **`a7006e48476226976d8b698881ac5274eb568a7d`**, coincidente con producción de Horarios. No fusionar #60 completo: sigue como evidencia de laboratorio.
- Fuente validada reutilizada: #60 HEAD documental `1adaecbb170e9614e597fd098a483f20ab300f71`, código `aa410f74717e5c02bc7041204354a99cce8dedeb`; #6 HEAD documental `2550fb91422355a5e8268df01e2c27154bb7164d`, código/contenedor `361d7271b417d55a8a80fa10b104697d19de2d61`.
- Cambios nuevos: selector 091 en Nueva semana, Auth y configuración privada, relectura de dotación/reglas reales antes de enviar, Worker híbrido y progreso/cancelación, adaptación al ResultadoAsignacion habitual, revalidación de ediciones desde snapshot y snapshot en el jsonb existente del historial/PDF. Contrato/objetivos/solver reutilizados, sin repetir el ensayo real.
- Activación requiere `VITE_AH2_HIBRIDO_091=true` y URL HTTPS CP-SAT; por defecto desactivada. Otras sucursales conservan la ruta previa. `src/utils/generacionMultiArranque.ts`, `netlify.toml` y funciones de pago permanecen idénticos a main base. Se excluyeron sitio piloto, páginas de laboratorio, contingencias/ciclos y el refinamiento experimental del multi-arranque.
- Domingo confirmado/modo prueba se incluyen solo en la activación 091; sin antecedente no se certifica descanso ni se guarda operativamente. No se alteran automáticamente condiciones/vigencias ni se transforma un sello de laboratorio en aprobación; la revalidación vuelve a comprobar plan, perfiles, condiciones y DIAS.

### SHAs y CI verificados durante preparación

- Primer candidato integrado `e9f24d18c7e8883fac01895f80c950d672fb20df`: CI `44782412210`, **test-build y browser SUCCESS**. Incluye Worker HTTPS/PDF/cancelación, selector 091 y regresiones de la ruta anterior. No equivale a servicio real desplegado ni Safari físico.
- Backend emparejado `5b98417c2d960d940e195f01d4c8e3cd6f0c52fc`: CI `44782328398` **SUCCESS**, 161 pytest / 1 omisión histórica, smoke, build Docker y ejecución HTTP del contenedor.
- Revisión final de esta entrega conserva también los mínimos de caja en el snapshot de generación, para no releer reglas posteriores al reexportar. TypeScript y las 9 pruebas de integración aprobados. Confirmar el SHA/CI de este ajuste en **PR #61**, que es el candidato vigente, no publicar el primer SHA por memoria. El commit que contiene este relevo tiene SHA posterior a los anteriores.

### Evidencia nueva y conservada

- TypeScript y build de la integración aprobados localmente; Worker híbrido emitido en dist. Pruebas nuevas de integración: 9 aprobadas; frontera Auth/HTTP reutilizada: 9; antecedente: 4. Backend: 7 pruebas HTTP aprobadas para `/v1/sesion` protegido/configuración privada; no se repitió el benchmark CP-SAT.
- Se releyó el checkpoint privado existente a través de la nueva adaptación/revalidación: **cero infracciones, 47 h faltantes y 0 sobrantes**; SIN VERIFICAR por ausencia del domingo real. Sin ejecutar nuevamente el solver ni extraer POM.
- La regresión local inicial dio 567 aprobadas/4 omitidas y una prueba de **multi-arranque experimental con condiciones** fuera del alcance de este candidato. Ese generador nuevo se excluyó para mantener el productivo exacto; su prueba permanece en #60, junto a cierre/ciclos. Verificar CI del SHA nuevo para el conjunto final.
- Playwright local no pudo arrancar Chromium (`socket() failed: Operation not permitted`); no equivale a prueba funcional aprobada. Los nuevos e2e de Worker HTTPS/adaptación/PDF/cancelación y selector 091/otras sucursales sí pasaron en la CI remota del primer candidato. Exigir la CI del ajuste final. No declarar ensayo real autenticado ni Safari físico.
- Evidencia matemática anterior se conserva: 355/402 h cubiertas, 47 faltantes, cero sobrantes; déficit diario 8 / 8 / 7,5 / 7,5 / 8 / 0 / 8. Primeros cinco objetivos OPTIMAL, resto FEASIBLE a 120 s; no óptimo total. No rehacer AH2-036–040.

### Estado real, límites y siguiente paso

**No publicado. No hay servicio CP-SAT operativo.** Netlify autenticado sí está disponible: se vio producción de Horarios bloqueada en deploy `6afba0e1c0b8e64caa476f2c`, SHA `a7006e4`; botón de republicación observado en deploy anterior. Prestify sigue bloqueado y publicado en `905cb7546ab65b0cc7e9d40f808d0c6fb4a8e6ea`. No se pulsó publicación/desbloqueo/rollback ni se modificaron esos proyectos.

Cloud Run y Cloud Shell no abrieron en esta sesión. El bloqueo restante de infraestructura es **alojar el contenedor CP-SAT en infraestructura disponible del propietario**, con acceso operativo y sin activar facturación ni gastos. No pedir otra app/proveedor. Código del servicio ya preparado; configurar origen exacto de Horarios, Auth, usuario y sucursal solo en servidor. No afirmar A+B efectivo cuando solo corre A.

RLS real revisada en lectura en esta sesión amplia: 15 activos (8 cajeros/3 AUX/4 EVENTUAL), 5 reglas; otro usuario/anon/sesión anónima ven 0 mediante transacciones READ ONLY con roles/claims y ROLLBACK. Esto no sustituye login real. Configuración privada conservada como `Aliada_091_S48_config_piloto_privada.json`; reutilizarla solo en servidor, revisar vigencia/semana. No incluir IDs personales ni nombres en código/bundle/PR.

Conteos de preparación (solo lectura, misma cuenta/091): colaboradores **17** (15 activos), reglas **5**, semanas **18**, correcciones **38**, aprendizajes **0**. Refrescar antes/después del despliegue; no confundir este registro con un control posterior a publicación.

**Próxima acción exacta:** verificar CI y SHAs del candidato/#6; con acceso efectivo al alojamiento sin costo, ejecutar controles sintéticos del servicio y luego el recorrido autenticado en preview del mismo proyecto. Revisar Safari, conteos operativos y rollback antes de proponer la promoción concreta. Guía ejecutable: [PUBLICACION_HIBRIDO_091.md](PUBLICACION_HIBRIDO_091.md). No migraciones, escrituras/borrados operativos, cambios Prestify, merges, despliegue manual ni gastos realizados en esta preparación.

---

Relevo previo de producción conservado en Git: [CURRENT_WORK de main base](https://github.com/FernandoDelgadoDiaz/Estimapres/blob/a7006e48476226976d8b698881ac5274eb568a7d/docs/CURRENT_WORK.md). La historia del laboratorio permanece en #60.
