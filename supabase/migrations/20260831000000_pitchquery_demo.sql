create table if not exists public.pitchquery_datasets (
  id text primary key,
  slug text not null unique,
  profile jsonb not null,
  csv_gzip_base64 text not null,
  openai_file_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pitchquery_daily_usage (
  day date primary key,
  tokens bigint not null default 0 check (tokens >= 0),
  updated_at timestamptz not null default now()
);

alter table public.pitchquery_datasets enable row level security;
alter table public.pitchquery_daily_usage enable row level security;

revoke all on public.pitchquery_datasets from anon, authenticated;
revoke all on public.pitchquery_daily_usage from anon, authenticated;
grant select, insert, update on public.pitchquery_datasets to service_role;
grant select, insert, update on public.pitchquery_daily_usage to service_role;

create or replace function public.pitchquery_add_usage(usage_day date, token_count bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
begin
  if token_count <= 0 then
    select coalesce(tokens, 0) into new_total
    from public.pitchquery_daily_usage
    where day = usage_day;
    return coalesce(new_total, 0);
  end if;

  insert into public.pitchquery_daily_usage(day, tokens, updated_at)
  values (usage_day, token_count, now())
  on conflict (day) do update
    set tokens = public.pitchquery_daily_usage.tokens + excluded.tokens,
        updated_at = now()
  returning tokens into new_total;
  return new_total;
end;
$$;

revoke all on function public.pitchquery_add_usage(date, bigint) from public, anon, authenticated;
grant execute on function public.pitchquery_add_usage(date, bigint) to service_role;
