-- Public scientific reference data only; projects and compositions remain local.
-- Keep tables in the unexposed schema, with narrowly scoped, read-only RPCs.
create table thermo_catalog.models (
  id text primary key check (id in ('ideal-gas', 'ideal-solution', 'modified-unifac-2.0')),
  name text not null,
  version text not null,
  sort_order smallint not null unique
);
insert into thermo_catalog.models (id, name, version, sort_order) values
  ('ideal-gas', 'Ideal gas', '2.0.0', 1),
  ('ideal-solution', 'Ideal solution · Raoult’s law', '2.0.0', 2),
  ('modified-unifac-2.0', 'Modified UNIFAC 2.0', '2.0.0', 3);
alter table thermo_catalog.models enable row level security;
revoke all on thermo_catalog.models from public, anon, authenticated;
grant usage on schema thermo_catalog to anon, authenticated;
grant select on thermo_catalog.models, thermo_catalog.parameters,
  thermo_catalog.releases, thermo_catalog.compounds to anon, authenticated, service_role;
create policy reference_models_read on thermo_catalog.models for select to anon, authenticated using (true);
create policy reference_parameters_read on thermo_catalog.parameters for select to anon, authenticated using (true);
create policy reference_releases_read on thermo_catalog.releases for select to anon, authenticated using (true);
create policy reference_compounds_read on thermo_catalog.compounds for select to anon, authenticated using (true);

create function public.chemical_catalog_models() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('id',id,'name',name,'version',version) order by sort_order)
  from thermo_catalog.models;
$$;
-- A release is visible only when every verified compound has been imported.
create or replace function public.chemical_catalog_release(p_release text default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('hash',r.hash,'parameterHash',r.parameter_hash,'manifest',r.manifest)
  from thermo_catalog.releases r
  where (p_release is null or r.hash=p_release)
    and (select count(*) from thermo_catalog.compounds c where c.release_hash=r.hash)
      = (r.manifest->'counts'->>'ideal-gas')::integer
  order by r.created_at desc,r.hash limit 1;
$$;
revoke all on function public.chemical_catalog_models() from public, anon, authenticated;
grant execute on function public.chemical_catalog_models(), public.chemical_catalog_release(text),
  public.chemical_catalog_search(text,text,text,integer),
  public.chemical_catalog_compounds(text,text[]), public.chemical_catalog_parameters(text)
  to anon, authenticated, service_role;
notify pgrst,'reload schema';
