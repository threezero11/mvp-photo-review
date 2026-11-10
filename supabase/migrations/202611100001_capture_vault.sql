begin;
create table if not exists public.capture_receipts (
 id uuid primary key default gen_random_uuid(),
 view_hash text not null unique check (view_hash ~ '^[0-9a-f]{64}$'),
 upload_hash text not null unique check (upload_hash ~ '^[0-9a-f]{64}$'),
 owner_hash text not null unique check (owner_hash ~ '^[0-9a-f]{64}$'),
 ip_hash text not null,
 purpose text not null check (purpose in ('general','trade','profile','work')),
 status text not null default 'pending' check (status in ('pending','storing','ready')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 minutes',
 received_at timestamptz,
 client_captured_at timestamptz,
 object_path text unique,
 sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
 byte_size integer check (byte_size between 1 and 5242880),
 width integer check (width between 1 and 4096),
 height integer check (height between 1 and 4096),
 revoked_at timestamptz,
 check (status <> 'ready' or (received_at is not null and object_path is not null and sha256 is not null and byte_size is not null and width is not null and height is not null))
);
alter table public.capture_receipts enable row level security;
alter table public.capture_receipts force row level security;
revoke all on public.capture_receipts from public,anon,authenticated;
grant all on public.capture_receipts to service_role;
create or replace function public.reserve_capture(p_view_hash text,p_upload_hash text,p_owner_hash text,p_ip_hash text,p_purpose text)
returns setof public.capture_receipts language plpgsql security definer set search_path = public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(1101001);
 if (select count(*) from public.capture_receipts where status='ready' or expires_at>now()) >= 200 then raise exception 'VAULT_CAPACITY';end if;
 if (select count(*) from public.capture_receipts where created_at>now()-interval '1 day')>=100 then raise exception 'DAILY_LIMIT';end if;
 if (select count(*) from public.capture_receipts where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=10 then raise exception 'RATE_LIMIT';end if;
 return query insert into public.capture_receipts(view_hash,upload_hash,owner_hash,ip_hash,purpose) values(p_view_hash,p_upload_hash,p_owner_hash,p_ip_hash,p_purpose) returning *;
end $$;
revoke all on function public.reserve_capture(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_capture(text,text,text,text,text) to service_role;
create or replace function public.protect_capture_original() returns trigger language plpgsql as $$
begin
 if old.status='ready' and (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then raise exception 'SEALED_ORIGINAL';end if;
 if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then raise exception 'REVOKED_RECEIPT';end if;
 return new;
end $$;
drop trigger if exists protect_capture_original on public.capture_receipts;
create trigger protect_capture_original before update on public.capture_receipts for each row execute function public.protect_capture_original();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('capture-originals','capture-originals',false,5242880,array['image/jpeg']) on conflict(id) do nothing;
comment on table public.capture_receipts is 'Camera MVP receipts. Server-only access, sealed metadata, capability links. No device-attestation or AI-free claim.';
commit;
