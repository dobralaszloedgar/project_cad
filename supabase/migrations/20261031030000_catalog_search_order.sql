-- Search the entire model-compatible release before sorting and paging.
-- Published chemical records are immutable; ranking changes no scientific data.
-- Keep the original RPC available for older application clients.
create or replace function public.chemical_catalog_search_v2(
  p_release text, p_query text, p_model text, p_limit integer default 20,
  p_field text default 'all', p_sort text default 'relevance', p_offset integer default 0
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with input as (
    select lower(btrim(p_query)) as raw,
      regexp_replace(lower(translate(p_query, '₀₁₂₃₄₅₆₇₈₉', '0123456789')), '[^a-z0-9]+', '', 'g') as q
    where length(p_query) <= 100
      and p_field in ('all', 'name', 'cas', 'formula')
      and p_sort in ('relevance', 'name')
  ), catalog as materialized (
    select id, name, formula, models,
      regexp_replace(lower(name), '[^a-z0-9]+', '', 'g') as search_name,
      replace(id, '-', '') as search_cas,
      regexp_replace(lower(formula), '[^a-z0-9]+', '', 'g') as search_formula
    from thermo_catalog.compounds
    where release_hash = p_release and p_model = any(models)
  ), matches as (
    select c.*,
      case
        when i.q = '' then 0
        when p_field in ('all', 'cas') and c.search_cas = i.q then 0
        when p_field in ('all', 'name') and c.search_name = i.q then 1
        when p_field in ('all', 'formula') and c.search_formula = i.q then 2
        when p_field in ('all', 'name') and starts_with(c.search_name, i.q) then 3
        when p_field in ('all', 'name') and exists (
          select 1 from regexp_split_to_table(lower(c.name), '[^a-z0-9]+') as words(word)
          where starts_with(word, i.q)
        ) then 4
        else 5
      end as match_rank,
      case when c.id = any(array[
        '7732-18-5', '67-56-1', '64-17-5', '67-64-1', '71-43-2', '108-88-3',
        '110-54-3', '142-82-5', '111-65-9', '74-82-8', '74-84-0', '74-98-6',
        '106-97-8', '109-66-0', '74-85-1', '115-07-1', '7782-44-7', '7727-37-9',
        '1333-74-0', '124-38-9', '630-08-0', '7664-41-7', '64-19-7', '67-63-0',
        '71-23-8', '71-36-3', '141-78-6', '107-21-1', '75-09-2', '108-10-1'
      ]) then 0 else 1 end as common_rank,
      case when c.name ~ '^[[:alpha:]]' and c.name !~* '^[a-z]{1,3}\s+[0-9]+(\s|$)'
        then 0 else 1 end as name_group
    from catalog c cross join input i
    where i.raw = '' or (i.q <> '' and
      case
        when p_field = 'cas' and i.raw ~ '^[1-9][0-9]{1,6}-[0-9]{2}-[0-9]$' then c.id = i.raw
        when length(i.q) <= 2 then
          (p_field in ('all', 'name') and starts_with(c.search_name, i.q)) or
          (p_field in ('all', 'cas') and c.search_cas = i.q) or
          (p_field in ('all', 'formula') and c.search_formula = i.q)
        else
          (p_field in ('all', 'name') and position(i.q in c.search_name) > 0) or
          (p_field in ('all', 'cas') and position(i.q in c.search_cas) > 0) or
          (p_field in ('all', 'formula') and position(i.q in c.search_formula) > 0)
      end)
  ), ranked as (
    select *, row_number() over (order by
      case when p_sort = 'relevance' then match_rank end,
      case when p_sort = 'relevance' then common_rank end,
      case when p_sort = 'relevance' then cardinality(models) end desc,
      name_group, lower(name) collate "C", name collate "C", id
    ) as ordinal from matches
  ), page as (
    select * from ranked order by ordinal
    limit greatest(1, least(p_limit, 50)) offset greatest(0, least(p_offset, 100000))
  )
  select jsonb_build_object(
    'total', (select count(*) from matches),
    'catalogTotal', (select count(*) from catalog),
    'results', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'formula', formula, 'models', models
    ) order by ordinal) from page), '[]'::jsonb)
  );
$$;

revoke all on function public.chemical_catalog_search_v2(text,text,text,integer,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.chemical_catalog_search_v2(text,text,text,integer,text,text,integer)
  to anon, authenticated, service_role;
notify pgrst, 'reload schema';
