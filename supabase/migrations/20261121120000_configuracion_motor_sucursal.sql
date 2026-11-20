-- PREPARADA, NO APLICADA. Requiere aprobación del propietario antes de ejecutarse en al-iada horarios.
-- Configuración editable del motor híbrido por sucursal (AH2-037/038/040/041/042).
-- Reemplaza la carga semanal en Secret Manager: reglas PERMANENTES (vigencia abierta) y EXCEPCIONES
-- TEMPORALES (con fecha de fin) se resuelven por semana en el cliente. No cambia el motor matemático.
-- Sin borrados: editar cierra la versión anterior (vigencia_hasta) y crea una nueva; desactivar = activa=false.

create table if not exists public.configuracion_motor_sucursal (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null default auth.uid(),
  sucursal_id text not null,
  clase text not null check (clase in ('permanente', 'temporal')),
  tipo text not null check (tipo in ('topes_caja_eventual_contrato', 'perfil_caja_eventual',
                                     'excepcion_apertura_aux_unico', 'condicion_supervisor')),
  colaborador_id uuid,
  vigencia_desde date not null,
  vigencia_hasta date,
  datos jsonb not null,
  activa boolean not null default true,
  motivo text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Una excepción temporal siempre tiene fin; una permanente puede cerrarse al ser reemplazada.
  constraint cms_temporal_con_fin check (clase = 'permanente' or vigencia_hasta is not null),
  constraint cms_vigencia_ordenada check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde),
  constraint cms_colaborador_segun_tipo check (
    (tipo = 'perfil_caja_eventual' and colaborador_id is not null) or
    (tipo in ('topes_caja_eventual_contrato', 'excepcion_apertura_aux_unico') and colaborador_id is null) or
    tipo = 'condicion_supervisor'),
  constraint cms_datos_objeto check (jsonb_typeof(datos) = 'object')
);

create index if not exists idx_cms_local_sucursal
  on public.configuracion_motor_sucursal (local_id, sucursal_id, tipo, vigencia_desde);

create or replace function public.cms_tocar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin new.actualizado_en := now(); return new; end $$;

drop trigger if exists cms_actualizado on public.configuracion_motor_sucursal;
create trigger cms_actualizado before update on public.configuracion_motor_sucursal
  for each row execute function public.cms_tocar_actualizado();

alter table public.configuracion_motor_sucursal enable row level security;

-- Solo el usuario propietario autenticado (no sesiones anónimas) ve y modifica sus filas.
drop policy if exists "cms_select_propias" on public.configuracion_motor_sucursal;
create policy "cms_select_propias" on public.configuracion_motor_sucursal for select to authenticated
  using (local_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false);

drop policy if exists "cms_insert_propias" on public.configuracion_motor_sucursal;
create policy "cms_insert_propias" on public.configuracion_motor_sucursal for insert to authenticated
  with check (local_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false);

drop policy if exists "cms_update_propias" on public.configuracion_motor_sucursal;
create policy "cms_update_propias" on public.configuracion_motor_sucursal for update to authenticated
  using (local_id = (select auth.uid()) and coalesce((select auth.jwt()->>'is_anonymous')::boolean, false) = false)
  with check (local_id = (select auth.uid()));

-- Sin política de DELETE: el historial de configuración no se borra desde la aplicación.

-- Rollback (solo si se aprueba revertir y no hay datos que conservar):
--   drop table if exists public.configuracion_motor_sucursal;
--   drop function if exists public.cms_tocar_actualizado();
