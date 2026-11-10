begin;
alter table public.capture_receipts add column if not exists owner_user_id uuid references auth.users(id);
alter table public.capture_receipts add column if not exists view_token_ciphertext text;
alter table public.capture_receipts add column if not exists title text not null default '촬영 기록' check(char_length(title) between 1 and 100);
alter table public.capture_receipts add column if not exists description text not null default '' check(char_length(description)<=2000);
alter table public.capture_receipts add column if not exists notes_updated_at timestamptz;
create index if not exists capture_owner_created on public.capture_receipts(owner_user_id,created_at desc);
create table if not exists public.capture_rate_events(created_at timestamptz not null default now(),ip_hash text not null);
alter table public.capture_rate_events enable row level security;
alter table public.capture_rate_events force row level security;
revoke all on public.capture_rate_events from public,anon,authenticated;
grant all on public.capture_rate_events to service_role;
create index if not exists capture_rate_created on public.capture_rate_events(created_at);
create or replace function public.reserve_capture(p_view_hash text,p_upload_hash text,p_owner_hash text,p_ip_hash text,p_purpose text)
returns setof public.capture_receipts language plpgsql security definer set search_path = public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(1101001);
 delete from public.capture_rate_events where created_at<now()-interval '1 day';
 if (select count(*) from public.capture_receipts where status='ready' or expires_at>now())>=200 then raise exception 'VAULT_CAPACITY';end if;
 if (select count(*) from public.capture_rate_events)>=100 then raise exception 'DAILY_LIMIT';end if;
 if (select count(*) from public.capture_rate_events where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=10 then raise exception 'RATE_LIMIT';end if;
 insert into public.capture_rate_events(ip_hash) values(p_ip_hash);
 return query insert into public.capture_receipts(view_hash,upload_hash,owner_hash,ip_hash,purpose) values(p_view_hash,p_upload_hash,p_owner_hash,p_ip_hash,p_purpose) returning *;
end $$;
create or replace function public.protect_capture_original() returns trigger language plpgsql as $$
begin
 if old.status='ready' and (to_jsonb(new)-array['revoked_at','title','description','notes_updated_at']) is distinct from (to_jsonb(old)-array['revoked_at','title','description','notes_updated_at']) then raise exception 'SEALED_ORIGINAL';end if;
 return new;
end $$;
comment on column public.capture_receipts.description is 'Owner-editable description. It is not part of the sealed original photo.';
commit;
