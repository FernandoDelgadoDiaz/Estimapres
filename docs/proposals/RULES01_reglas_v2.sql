-- RULES-01 (#11) — PROPUESTA, NO APLICADA. Requiere autorización del propietario,
-- respaldo previo y ventana acordada. NO mover a supabase/migrations sin aprobación.
-- Modelo: src/reglas/reglasV2.ts (ReglaV2, Grupo). Convive con reglas_configurables
-- hasta que el cliente lea el modelo nuevo; la migración de datos es idempotente.
--
-- Mapeo reglas_configurables → reglas_v2 (implementado y probado en desdeReglasLegacy):
--   ámbito 'local'        → ambito_tipo 'SUCURSAL', ambito_id = sucursal_id
--   ámbito 'colaborador'  → ambito_tipo 'PERSONA', ambito_id = colaboradores.id
--                           (solo si el nombre es único en la sucursal; si no, queda pendiente)
--   franco_fijo           → {"tipo":"franco_fijo","dia":N}
--   no_antes_de / no_despues_de → {"tipo":"ventana_horaria","entradaDesde"|"salidaHasta":"HH:MM"}
--   siempre_cierre        → {"tipo":"siempre_cierre"}
--   siempre_manana        → {"tipo":"solo_turno","turno":"manana"}
--   min_cajeros_franja    → {"tipo":"min_cajeros_franja","dia","desde","hasta","cantidad"}
--   max_francos_dia       → {"tipo":"max_francos_dia","cantidad"}
--   toggles R1..R4        → {"tipo":"toggle_operativo","clave":"<tipo>","valor":<activa>} (activa = true)
--   vigencia              → RANGO si hay fecha_hasta; si no, PERMANENTE (desde opcional)
--   nivel OPERATIVA, prioridad 0, auditoría creada_por = 'legacy'.

begin;

create table if not exists public.grupos_colaboradores (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  sucursal_id text not null,
  nombre text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.grupos_miembros (
  grupo_id uuid not null references public.grupos_colaboradores(id) on delete cascade,
  colaborador_id text not null,          -- = colaboradores.id::text (verificar tipo real)
  desde date, hasta date,
  primary key (grupo_id, colaborador_id, desde)
);

create table if not exists public.reglas_v2 (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  sucursal_id text not null,
  nivel text not null check (nivel in ('OPERATIVA','PREFERENCIA')),
  ambito_tipo text not null check (ambito_tipo in ('EMPRESA','SUCURSAL','GRUPO','PERSONA')),
  ambito_id text not null,
  parametros jsonb not null,             -- {"tipo": ..., ...} según Parametros
  vigencia jsonb not null,               -- {"tipo":"SEMANA"|"MES"|"RANGO"|"PERMANENTE", ...}
  prioridad integer not null default 0,
  activa boolean not null default true,
  descripcion text not null default '',
  creada_por text not null,
  creada_en timestamptz not null default now(),
  motivo text not null default '',
  version integer not null default 1,
  legacy_id uuid unique                  -- trazabilidad con reglas_configurables.id
);
create index if not exists idx_reglas_v2_suc on public.reglas_v2 (local_id, sucursal_id);

alter table public.reglas_v2 enable row level security;
alter table public.grupos_colaboradores enable row level security;
alter table public.grupos_miembros enable row level security;
create policy reglas_v2_propias on public.reglas_v2 for all using (local_id = auth.uid()) with check (local_id = auth.uid());
create policy grupos_propios on public.grupos_colaboradores for all using (local_id = auth.uid()) with check (local_id = auth.uid());
create policy miembros_propios on public.grupos_miembros for all
  using (exists (select 1 from public.grupos_colaboradores g where g.id = grupo_id and g.local_id = auth.uid()))
  with check (exists (select 1 from public.grupos_colaboradores g where g.id = grupo_id and g.local_id = auth.uid()));

commit;

-- La copia de datos legacy → reglas_v2 se hará desde el cliente con desdeReglasLegacy()
-- (misma lógica probada), registrando como «pendientes» los nombres ambiguos, en lugar de
-- replicar el mapeo en SQL. Requiere autorización separada.
--
-- ROLLBACK:
-- begin;
-- drop table if exists public.reglas_v2;
-- drop table if exists public.grupos_miembros;
-- drop table if exists public.grupos_colaboradores;
-- commit;
--
-- VERIFICAR ANTES (solo lectura): tipo de colaboradores.id y existencia de sucursal_id en reglas_configurables.
