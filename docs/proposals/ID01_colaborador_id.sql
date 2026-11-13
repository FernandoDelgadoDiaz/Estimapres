-- ID-01 (#9) — PROPUESTA, NO APLICADA. Requiere autorización del propietario,
-- respaldo previo y ventana acordada. NO mover a supabase/migrations sin aprobación.
--
-- Objetivo: que reglas, correcciones y aprendizajes referencien al colaborador por
-- id estable (colaboradores.id) y no por nombre, para que renombrar no corte el
-- historial. Compatible hacia atrás: la columna nueva es opcional y el cliente
-- seguirá aceptando colaborador_nombre mientras convivan ambos.

begin;

alter table public.reglas_configurables   add column if not exists colaborador_id text;  -- = colaboradores.id::text (tipo de colaboradores.id no versionado en el repo: verificar)
alter table public.correcciones_manuales  add column if not exists colaborador_id text;  -- = colaboradores.id::text (tipo de colaboradores.id no versionado en el repo: verificar)
alter table public.aprendizajes_derivados add column if not exists colaborador_id text;  -- = colaboradores.id::text (tipo de colaboradores.id no versionado en el repo: verificar)

-- Backfill SOLO cuando el nombre identifica a una única persona del mismo local
-- (homónimos quedan en NULL y se resuelven a mano desde la UI).
with unicos as (
  select local_id, sucursal_id, lower(nombre) as n, min(id::text) as id
  from public.colaboradores group by local_id, sucursal_id, lower(nombre) having count(*) = 1
)
update public.reglas_configurables r set colaborador_id = u.id
  from unicos u where r.colaborador_id is null and r.local_id = u.local_id and r.sucursal_id = u.sucursal_id and lower(r.colaborador_nombre) = u.n;
with unicos as (
  select local_id, sucursal_id, lower(nombre) as n, min(id::text) as id
  from public.colaboradores group by local_id, sucursal_id, lower(nombre) having count(*) = 1
)
update public.correcciones_manuales c set colaborador_id = u.id
  from unicos u where c.colaborador_id is null and c.local_id = u.local_id and c.sucursal_id = u.sucursal_id and lower(c.colaborador_nombre) = u.n;
with unicos as (
  select local_id, sucursal_id, lower(nombre) as n, min(id::text) as id
  from public.colaboradores group by local_id, sucursal_id, lower(nombre) having count(*) = 1
)
update public.aprendizajes_derivados a set colaborador_id = u.id
  from unicos u where a.colaborador_id is null and a.local_id = u.local_id and a.sucursal_id = u.sucursal_id and lower(a.colaborador_nombre) = u.n;

create index if not exists idx_reglas_colab on public.reglas_configurables (colaborador_id);
create index if not exists idx_correcciones_colab on public.correcciones_manuales (colaborador_id);
create index if not exists idx_aprendizajes_colab on public.aprendizajes_derivados (colaborador_id);

commit;

-- ROLLBACK (si fuera necesario):
-- begin;
-- drop index if exists idx_reglas_colab, idx_correcciones_colab, idx_aprendizajes_colab;
-- alter table public.reglas_configurables   drop column if exists colaborador_id;
-- alter table public.correcciones_manuales  drop column if exists colaborador_id;
-- alter table public.aprendizajes_derivados drop column if exists colaborador_id;
-- commit;
--
-- VERIFICACIONES PREVIAS (solo lectura) antes de aplicar:
--   select local_id, sucursal_id, lower(nombre), count(*) from public.colaboradores group by 1,2,3 having count(*) > 1;  -- homónimos
--   (la tabla colaboradores y las columnas sucursal_id se crearon fuera de supabase/migrations: confirmar esquema real)
--   select column_name, data_type from information_schema.columns where table_name = 'colaboradores';     -- confirmar id uuid y columna nombre
