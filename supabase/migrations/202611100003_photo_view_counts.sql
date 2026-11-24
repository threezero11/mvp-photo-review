begin;
alter table public.capture_receipts add column if not exists view_count bigint not null default 0 check(view_count>=0);
create or replace function public.protect_capture_original() returns trigger language plpgsql as $$
begin
 if old.status='ready' and (to_jsonb(new)-array['revoked_at','title','description','notes_updated_at','view_count']) is distinct from (to_jsonb(old)-array['revoked_at','title','description','notes_updated_at','view_count']) then raise exception 'SEALED_ORIGINAL';end if;
 return new;
end $$;
create or replace function public.record_capture_visit(p_view_hash text)
returns table(view_count bigint) language sql security definer set search_path=public,pg_temp as $$
 update public.capture_receipts c set view_count=c.view_count+1
 where c.view_hash=p_view_hash and c.status='ready' and c.revoked_at is null
 returning c.view_count;
$$;
revoke all on function public.record_capture_visit(text) from public,anon,authenticated;
grant execute on function public.record_capture_visit(text) to service_role;
comment on column public.capture_receipts.view_count is 'Shared-photo openings counted after client integrity verification. Repeat openings count. No unique visitor tracking. Owner-authenticated views are excluded. Existing views before this feature are not included.';
commit;
