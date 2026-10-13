begin;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  contact text not null check (char_length(btrim(contact)) between 5 and 120),
  message text not null default '' check (char_length(message) <= 2000)
);

alter table public.applications enable row level security;
alter table public.applications force row level security;

revoke all on table public.applications from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant insert (id, name, contact, message) on public.applications to anon, authenticated;

create policy "Visitors can submit applications only"
on public.applications
for insert
to anon, authenticated
with check (
  char_length(btrim(name)) between 1 and 60
  and char_length(btrim(contact)) between 5 and 120
  and char_length(message) <= 2000
);

comment on table public.applications is '바로체크 도입 신청. 브라우저는 추가만 가능하며 조회·수정·삭제는 불가.';

commit;
