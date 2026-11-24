begin;
create table if not exists public.capture_folders(
 id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references auth.users(id),
 title text not null check(char_length(title) between 1 and 100),
 view_hash text not null unique check(view_hash~'^[0-9a-f]{64}$'),view_token_ciphertext text not null,
 created_at timestamptz not null default now(),revoked_at timestamptz
);
create table if not exists public.capture_folder_photos(
 folder_id uuid not null references public.capture_folders(id) on delete cascade,
 photo_id uuid not null references public.capture_receipts(id) on delete cascade,
 primary key(folder_id,photo_id)
);
alter table public.capture_folders enable row level security;
alter table public.capture_folders force row level security;
alter table public.capture_folder_photos enable row level security;
alter table public.capture_folder_photos force row level security;
revoke all on public.capture_folders,public.capture_folder_photos from public,anon,authenticated;
grant all on public.capture_folders,public.capture_folder_photos to service_role;
create index if not exists capture_folders_owner on public.capture_folders(owner_user_id,created_at desc);
create index if not exists capture_folder_photos_photo on public.capture_folder_photos(photo_id);
create or replace function public.set_capture_folder_photos(p_folder_id uuid,p_owner_user_id uuid,p_photo_ids uuid[])
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.capture_folders where id=p_folder_id and owner_user_id=p_owner_user_id for update;
 if not found then raise exception 'FOLDER_NOT_FOUND';end if;
 if coalesce(cardinality(p_photo_ids),0)>200 then raise exception 'BAD_REQUEST';end if;
 if exists(select 1 from unnest(coalesce(p_photo_ids,array[]::uuid[])) as requested(id) where not exists(select 1 from public.capture_receipts c where c.id=requested.id and c.owner_user_id=p_owner_user_id and c.status='ready')) then raise exception 'FOLDER_PHOTO_FORBIDDEN';end if;
 delete from public.capture_folder_photos where folder_id=p_folder_id;
 insert into public.capture_folder_photos(folder_id,photo_id) select p_folder_id,id from(select distinct unnest(coalesce(p_photo_ids,array[]::uuid[])) as id) selected;
end $$;
revoke all on function public.set_capture_folder_photos(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.set_capture_folder_photos(uuid,uuid,uuid[]) to service_role;
commit;
