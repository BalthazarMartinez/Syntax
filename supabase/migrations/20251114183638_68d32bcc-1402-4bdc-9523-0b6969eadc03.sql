-- ================================================
-- SECURITY FIX: Implement Proper Role Management
-- ================================================

-- 1. Create enum for roles
create type public.app_role as enum ('admin', 'member');

-- 2. Create user_roles table
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamp with time zone default now(),
  unique (user_id, role)
);

-- 3. Enable RLS on user_roles
alter table public.user_roles enable row level security;

-- 4. Create security definer function to check roles
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- 5. Update is_admin function to use has_role (instead of dropping)
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_role(_user_id, 'admin')
$$;

-- 6. Migrate existing role data from profiles to user_roles
insert into public.user_roles (user_id, role)
select id, role::app_role
from public.profiles
where role in ('admin', 'member')
on conflict (user_id, role) do nothing;

-- 7. Add RLS policies to user_roles table
create policy "Admins can view all user roles"
  on public.user_roles for select
  to authenticated
  using (has_role(auth.uid(), 'admin'));

create policy "Users can view their own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Only admins can insert user roles"
  on public.user_roles for insert
  to authenticated
  with check (has_role(auth.uid(), 'admin'));

create policy "Only admins can update user roles"
  on public.user_roles for update
  to authenticated
  using (has_role(auth.uid(), 'admin'));

create policy "Only admins can delete user roles"
  on public.user_roles for delete
  to authenticated
  using (has_role(auth.uid(), 'admin'));

-- 8. Add INSERT policy to profiles table
create policy "Users can create their own profile during registration"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- 9. Update handle_new_user trigger to assign default member role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert profile
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email
  );
  
  -- Assign default member role
  insert into public.user_roles (user_id, role)
  values (new.id, 'member')
  on conflict (user_id, role) do nothing;
  
  return new;
end;
$$;