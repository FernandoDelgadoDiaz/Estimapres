-- Migración: capacidades configurables de Aliada Horarios
-- Tablas: reglas_configurables, semanas_historial, correcciones_manuales,
-- aprendizajes_derivados. Todas con RLS: cada usuario autenticado (incluye
-- sesiones anónimas) solo ve y modifica sus propios registros (local_id = auth.uid()).

create extension if not exists "pgcrypto";

-- ==================== 1. REGLAS CONFIGURABLES ====================
create table if not exists public.reglas_configurables (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  tipo text not null check (tipo in ('colaborador', 'general')),
  colaborador_nombre text,
  parametros jsonb not null default '{}'::jsonb,
  activa boolean not null default true,
  fecha_desde date,
  fecha_hasta date,
  descripcion text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_reglas_local on public.reglas_configurables (local_id);

alter table public.reglas_configurables enable row level security;

drop policy if exists "reglas_select_propias" on public.reglas_configurables;
create policy "reglas_select_propias" on public.reglas_configurables
  for select using (local_id = auth.uid());

drop policy if exists "reglas_insert_propias" on public.reglas_configurables;
create policy "reglas_insert_propias" on public.reglas_configurables
  for insert with check (local_id = auth.uid());

drop policy if exists "reglas_update_propias" on public.reglas_configurables;
create policy "reglas_update_propias" on public.reglas_configurables
  for update using (local_id = auth.uid()) with check (local_id = auth.uid());

drop policy if exists "reglas_delete_propias" on public.reglas_configurables;
create policy "reglas_delete_propias" on public.reglas_configurables
  for delete using (local_id = auth.uid());

-- ==================== 2. SEMANAS HISTORIAL (con versionado) ====================
create table if not exists public.semanas_historial (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  lunes_fecha date not null,
  version integer not null default 1,
  horario_completo jsonb not null,
  metricas jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (local_id, lunes_fecha, version)
);

create index if not exists idx_semanas_local_lunes
  on public.semanas_historial (local_id, lunes_fecha desc, version desc);

alter table public.semanas_historial enable row level security;

drop policy if exists "semanas_select_propias" on public.semanas_historial;
create policy "semanas_select_propias" on public.semanas_historial
  for select using (local_id = auth.uid());

drop policy if exists "semanas_insert_propias" on public.semanas_historial;
create policy "semanas_insert_propias" on public.semanas_historial
  for insert with check (local_id = auth.uid());

drop policy if exists "semanas_update_propias" on public.semanas_historial;
create policy "semanas_update_propias" on public.semanas_historial
  for update using (local_id = auth.uid()) with check (local_id = auth.uid());

drop policy if exists "semanas_delete_propias" on public.semanas_historial;
create policy "semanas_delete_propias" on public.semanas_historial
  for delete using (local_id = auth.uid());

-- ==================== 3. CORRECCIONES MANUALES ====================
create table if not exists public.correcciones_manuales (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  semana_id uuid,
  colaborador_nombre text not null,
  dia smallint not null check (dia between 0 and 6),
  antes jsonb not null,
  despues jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_correcciones_local on public.correcciones_manuales (local_id);

alter table public.correcciones_manuales enable row level security;

drop policy if exists "correcciones_select_propias" on public.correcciones_manuales;
create policy "correcciones_select_propias" on public.correcciones_manuales
  for select using (local_id = auth.uid());

drop policy if exists "correcciones_insert_propias" on public.correcciones_manuales;
create policy "correcciones_insert_propias" on public.correcciones_manuales
  for insert with check (local_id = auth.uid());

drop policy if exists "correcciones_update_propias" on public.correcciones_manuales;
create policy "correcciones_update_propias" on public.correcciones_manuales
  for update using (local_id = auth.uid()) with check (local_id = auth.uid());

drop policy if exists "correcciones_delete_propias" on public.correcciones_manuales;
create policy "correcciones_delete_propias" on public.correcciones_manuales
  for delete using (local_id = auth.uid());

-- ==================== 4. APRENDIZAJES DERIVADOS ====================
-- Materialización de los patrones detectados en las correcciones. La fuente de
-- verdad son las correcciones; esta tabla se resincroniza al cambiar aquellas.
create table if not exists public.aprendizajes_derivados (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  colaborador_nombre text not null,
  tipo text not null,
  parametros jsonb not null default '{}'::jsonb,
  fuerza numeric not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_aprendizajes_local on public.aprendizajes_derivados (local_id);

alter table public.aprendizajes_derivados enable row level security;

drop policy if exists "aprendizajes_select_propios" on public.aprendizajes_derivados;
create policy "aprendizajes_select_propios" on public.aprendizajes_derivados
  for select using (local_id = auth.uid());

drop policy if exists "aprendizajes_insert_propios" on public.aprendizajes_derivados;
create policy "aprendizajes_insert_propios" on public.aprendizajes_derivados
  for insert with check (local_id = auth.uid());

drop policy if exists "aprendizajes_update_propios" on public.aprendizajes_derivados;
create policy "aprendizajes_update_propios" on public.aprendizajes_derivados
  for update using (local_id = auth.uid()) with check (local_id = auth.uid());

drop policy if exists "aprendizajes_delete_propios" on public.aprendizajes_derivados;
create policy "aprendizajes_delete_propios" on public.aprendizajes_derivados
  for delete using (local_id = auth.uid());
