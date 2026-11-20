# Ensayo privado de la sucursal 091 con datos reales: procedimiento

**20/11/2026 · Claude.** Este documento **no** ejecuta nada.
- No se accedió a datos reales ni a Supabase.
- Las decisiones de negocio se consultan exclusivamente en `docs/ALIADA_HORARIOS_MASTER.md`; el estado vigente y los pasos de ejecución, en la primera sección de `docs/CURRENT_WORK.md`. Este procedimiento no constituye autoridad para reabrir decisiones.
- El ensayo requiere **autorización específica del propietario** para usar el POM y la dotación reales de la 091.
- Todo ocurre en una computadora controlada. Ningún dato real se sube a GitHub, a issues, a PR ni a servicios externos.

## 1. Requisitos previos

| # | Requisito | Estado |
|---|---|---|
| 1 | Autorización escrita del propietario para usar el POM y la dotación de la 091 de una semana concreta. | **Pendiente** |
| 2 | Computadora controlada con Node 20+, Python 3.12, OR-Tools 9.15 y los dos repositorios en los HEAD de los PR #60 y #6. | Disponible en laboratorio |
| 3 | Carpeta privada fuera de los repositorios (por ejemplo `~/aliada-privado/091/`), con permisos solo para el usuario. Se borra al terminar. | Pendiente |
| 4 | Verificar implementación de la excepción de apertura ya aprobada (MASTER AH2-037) y tratamiento de tres o más AUX simultáneos (ver §4). | Excepción aprobada; implementación pendiente. Tres o más AUX: política pendiente si ocurre. |
| 5 | Perfiles de disponibilidad de caja de cada EVENTUAL (acreditación, reservas, tope si corresponde) y fichas PART con horas. | Pendiente de carga |

## 2. Preparación de los datos (en la carpeta privada)

1. **Exportar el paquete de pantalla** `aliada-lab-paquete/1` con los datos de la semana elegida:

   | Campo | Contenido |
   |---|---|
   | `necesidad` | Franjas del POM, igual que en «Nueva semana». |
   | `cajeros` | FULL y PART con `horasSemanales`. |
   | `auxiliares` | Presencia (`horarioSemanal`). |
   | `eventuales` | Presencia. |
   | `excepciones` | Las de esa semana. |
   | `opciones` | Ver la lista siguiente. |

   Contenido de `opciones`:
   - `politica_recursos_version: 1`;
   - reglas de la 091: apertura, cierre, supervisor, francos y límites de EVENTUAL;
   - `disponibilidad_caja_eventual` con los perfiles;
   - `max_caja_eventual_slots` solo si existe un tope aprobado.

   El formato es el que lee `src/hibrido/paquete.ts`, mediante el mismo adaptador de la aplicación. El paquete se arma a mano o con una exportación local autorizada; no se agrega ningún botón de exportación a producción.
2. **Seudonimizar opcionalmente** (`Cajero 1…n`) si el ensayo lo van a ver terceros. El laboratorio no necesita nombres reales.
3. Verificar que el archivo **no** quede dentro de `estimapres/` ni de `aliada-optimizer/`: `git status` de ambos debe salir limpio.

## 3. Ejecución

```bash
cd estimapres
AH2_LAB_CPSAT_DIR=../aliada-optimizer npm run dev -- --host 127.0.0.1
# Abrir http://127.0.0.1:5173/lab-condiciones.html
```

1. **Datos → «Archivo JSON local»:** elegir el paquete. Se lee en el navegador y solo viaja al CP-SAT de la misma máquina.
2. Revisar el resumen: demanda POM, FULL/PART · AUX · EVENTUAL y semana.
3. Cargar las **condiciones DEBE/PREFERIRÍA** del supervisor de esa semana.
4. **Motores:** A + CP-SAT, con tiempo de 30 s.
5. «Verificar y generar prueba». Seguir el progreso real: A, sobre enviado, fases de CP-SAT, respuesta, validación y selección.
6. Revisar:
   - **bloqueos de política** (alerta);
   - cobertura, faltantes por franja y sobrantes;
   - horarios de la semana;
   - horas-caja por persona;
   - supervisión AUX;
   - AH2-040: pares comparables, EVENTUAL sin comparable y faltantes atribuibles a la regla;
   - conflictos.
7. «Descargar PDF no oficial» dentro de la carpeta privada. **No** imprimir ni distribuir como horario.
8. Comparar con el horario realmente usado esa semana. Registrar en notas privadas: diferencias de cobertura por franja, horas por persona y observaciones del supervisor.
9. Al terminar: cerrar el servidor, borrar la carpeta privada si así se acordó y anotar en el CURRENT_WORK **solo métricas agregadas sin datos personales**: cobertura, faltantes, tiempos, estados y bloqueos.

## 4. Bloqueos conocidos que impiden un ensayo concluyente

| Bloqueo | Comportamiento actual | Decisión que falta |
|---|---|---|
| **Tres o más AUX presentes en la misma franja** | B devuelve `DATOS_INCOMPLETOS` (`POLITICA_AUX_MULTIPLE`). A genera, pero la salida muestra el bloqueo y las capacidades K/Kd solo modelan 1–2 AUX. | Generalizar la supervisión y la capacidad de caja para tres o más AUX: cuántos supervisan y quién puede atender caja. |
| **Apertura con AUX único (08–09)** | La implementación anterior puede bloquearla (`POLITICA_APERTURA_SUPERVISION`). | **Ya aprobada en MASTER AH2-037**: excepción configurable local; implementar y verificar en A/B y validadores. No pedir otra aprobación ni inventar supervisión externa. |
| **EVENTUAL sin perfil de caja acreditado** | 0 h de caja y bloqueo `EV_CAJA_*`. | Cargar los perfiles reales (acreditación, reservas y tope si se aprueba). |
| **AH2-040 con DIAS** | Aplicada en laboratorio. Pierde cobertura en jornadas muy distintas los mismos días (D1/N3) y no compara con AUX de días parciales (S2/S6/S8). | Homologación operativa final (fuera del laboratorio). |
| **Ejecución de B fuera de la computadora local** | Solo existe el servidor de desarrollo local. | Autorizar la infraestructura (`docs/HIBRIDO_INFRAESTRUCTURA.md`). |

## 5. Criterios para considerar el ensayo exitoso

1. No hay bloqueos de política pendientes, o los presentes están explicados y aceptados para el ensayo.
2. La propuesta no tiene infracciones operativas ni normativas: los validadores A y B pasan.
3. FULL/PART cumplen el 100 % contractual; se respetan la prioridad AUX y la supervisión, y AH2-040 (DIAS) no registra incumplimientos.
4. El supervisor encuentra la propuesta comprensible y comparable con su práctica.
5. Las diferencias de cobertura frente al horario real quedan documentadas por franja.
6. Nada se publicó, guardó en Supabase ni subió a GitHub.
