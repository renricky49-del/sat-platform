-- 喵喵 SAT 通关：数据库结构与权限
-- 在 Supabase 后台 SQL Editor 里整段粘贴运行一次即可。

-- 每个账号的身份：student / parent / teacher
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'parent', 'teacher'))
);

-- 练习数据（对应原来的 runs / reviews / wrong / notes / extras / days / weekly / meta）
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);

-- 题库与每周计划：只有登录的人能读，只能用后台密钥写入
create table if not exists public.weeks (
  week int primary key,
  data jsonb not null
);
create table if not exists public.questions (
  id text primary key,
  week int not null,
  data jsonb not null
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

alter table public.profiles enable row level security;
alter table public.docs enable row level security;
alter table public.weeks enable row level security;
alter table public.questions enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (user_id = auth.uid());

drop policy if exists "family reads docs" on public.docs;
create policy "family reads docs" on public.docs for select using (public.my_role() is not null);

drop policy if exists "student writes docs" on public.docs;
create policy "student writes docs" on public.docs for all
  using (public.my_role() = 'student') with check (public.my_role() = 'student');

-- 爸爸可以确认金币兑换
drop policy if exists "parent confirms ledger" on public.docs;
create policy "parent confirms ledger" on public.docs for update
  using (public.my_role() = 'parent' and col = 'meta' and id = 'ledger')
  with check (public.my_role() = 'parent' and col = 'meta' and id = 'ledger');

drop policy if exists "family reads weeks" on public.weeks;
create policy "family reads weeks" on public.weeks for select using (public.my_role() is not null);

drop policy if exists "family reads questions" on public.questions;
create policy "family reads questions" on public.questions for select using (public.my_role() is not null);

-- 账号建好后，把下面三个邮箱换成真实邮箱再运行这一段
-- insert into public.profiles (user_id, role)
-- select id, case email
--   when 'student@example.com' then 'student'
--   when 'dad@example.com' then 'parent'
--   when 'teacher@example.com' then 'teacher' end
-- from auth.users
-- where email in ('student@example.com', 'dad@example.com', 'teacher@example.com')
-- on conflict (user_id) do update set role = excluded.role;
