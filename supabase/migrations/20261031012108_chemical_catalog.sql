-- Scientific reference records only. User projects and operating conditions stay local.
create schema if not exists thermo_catalog;
revoke all on schema thermo_catalog from public, anon, authenticated;
grant usage on schema thermo_catalog to service_role;

create table thermo_catalog.parameters (
  hash text primary key check (hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null
);
create table thermo_catalog.releases (
  hash text primary key check (hash ~ '^[a-f0-9]{64}$'),
  parameter_hash text not null references thermo_catalog.parameters(hash),
  manifest jsonb not null,
  created_at timestamptz not null default now()
);
create table thermo_catalog.compounds (
  release_hash text not null references thermo_catalog.releases(hash),
  id text not null,
  record_hash text not null check (record_hash ~ '^[a-f0-9]{64}$'),
  name text not null,
  formula text not null,
  models text[] not null,
  payload jsonb not null,
  primary key (release_hash,id)
);
create index compounds_search_order on thermo_catalog.compounds(release_hash,name,id);
alter table thermo_catalog.parameters enable row level security;
alter table thermo_catalog.releases enable row level security;
alter table thermo_catalog.compounds enable row level security;
revoke all on all tables in schema thermo_catalog from public,anon,authenticated;
grant select on all tables in schema thermo_catalog to service_role;

create function thermo_catalog.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Published chemical catalog records are immutable. Import a new release.'; end;
$$;
create trigger immutable_parameters before update or delete on thermo_catalog.parameters
for each row execute function thermo_catalog.reject_mutation();
create trigger immutable_releases before update or delete on thermo_catalog.releases
for each row execute function thermo_catalog.reject_mutation();
create trigger immutable_compounds before update or delete on thermo_catalog.compounds
for each row execute function thermo_catalog.reject_mutation();

create function public.chemical_catalog_release(p_release text default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('hash',hash,'parameterHash',parameter_hash,'manifest',manifest)
  from thermo_catalog.releases where p_release is null or hash=p_release
  order by created_at desc,hash limit 1;
$$;
create function public.chemical_catalog_search(p_release text, p_query text, p_model text, p_limit integer default 20) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with matches as (
    select id,name,formula,models from thermo_catalog.compounds
    where release_hash=p_release and p_model=any(models)
      and length(p_query)<=100
      and position(lower(p_query) in lower(id || ' ' || name || ' ' || formula))>0
  ), page as (select * from matches order by name,id limit greatest(1,least(p_limit,50)))
  select jsonb_build_object('total',(select count(*) from matches),
    'results',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb));
$$;
create function public.chemical_catalog_compounds(p_release text,p_ids text[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('hash',record_hash,'chemical',payload)),'[]'::jsonb)
  from thermo_catalog.compounds where release_hash=p_release and id=any(p_ids)
    and cardinality(p_ids) between 1 and 64;
$$;
create function public.chemical_catalog_parameters(p_hash text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select payload from thermo_catalog.parameters where hash=p_hash;
$$;
revoke all on function public.chemical_catalog_release(text),
  public.chemical_catalog_search(text,text,text,integer),
  public.chemical_catalog_compounds(text,text[]),public.chemical_catalog_parameters(text) from public,anon,authenticated;
grant execute on function public.chemical_catalog_release(text),
  public.chemical_catalog_search(text,text,text,integer),
  public.chemical_catalog_compounds(text,text[]),public.chemical_catalog_parameters(text) to service_role;
revoke all on function thermo_catalog.reject_mutation() from public,anon,authenticated;
notify pgrst,'reload schema';
