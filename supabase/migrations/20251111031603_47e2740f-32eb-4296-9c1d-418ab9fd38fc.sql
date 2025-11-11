-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin','member')) default 'member',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Profiles RLS policies
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Create function to check if user is admin
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = _user_id
      and role = 'admin'
  )
$$;

-- Admin policy for viewing all profiles
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

-- Create clients table
create table public.clients (
  id bigserial primary key,
  name varchar(120) not null unique,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS on clients
alter table public.clients enable row level security;

-- Clients RLS policies
create policy "Authenticated users can view clients"
  on public.clients for select
  to authenticated
  using (true);

create policy "Authenticated users can create clients"
  on public.clients for insert
  to authenticated
  with check (true);

create policy "Admins can update clients"
  on public.clients for update
  using (public.is_admin(auth.uid()));

create policy "Admins can delete clients"
  on public.clients for delete
  using (public.is_admin(auth.uid()));

-- Create opportunities table
create table public.opportunities (
  id bigserial primary key,
  name varchar(120) not null,
  client_id bigint not null references public.clients(id) on delete restrict,
  responsible_user_id uuid not null references public.profiles(id) on delete restrict,
  creation_date date default current_date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

-- Enable RLS on opportunities
alter table public.opportunities enable row level security;

-- Opportunities RLS policies
create policy "Users can view their own opportunities"
  on public.opportunities for select
  using (auth.uid() = responsible_user_id or auth.uid() = created_by);

create policy "Admins can view all opportunities"
  on public.opportunities for select
  using (public.is_admin(auth.uid()));

create policy "Authenticated users can create opportunities"
  on public.opportunities for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Users can update their own opportunities"
  on public.opportunities for update
  using (auth.uid() = responsible_user_id or auth.uid() = created_by);

create policy "Admins can update all opportunities"
  on public.opportunities for update
  using (public.is_admin(auth.uid()));

create policy "Users can delete their own opportunities"
  on public.opportunities for delete
  using (auth.uid() = responsible_user_id or auth.uid() = created_by);

create policy "Admins can delete all opportunities"
  on public.opportunities for delete
  using (public.is_admin(auth.uid()));

-- Create inputs table
create table public.inputs (
  id bigserial primary key,
  opportunity_id bigint not null references public.opportunities(id) on delete cascade,
  file_name varchar(200) not null,
  gdrive_file_id varchar(200) not null,
  gdrive_web_url varchar(500) not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamp with time zone default now()
);

-- Enable RLS on inputs
alter table public.inputs enable row level security;

-- Inputs RLS policies
create policy "Users can view inputs for their opportunities"
  on public.inputs for select
  using (
    exists (
      select 1 from public.opportunities
      where id = opportunity_id
      and (responsible_user_id = auth.uid() or created_by = auth.uid())
    )
  );

create policy "Admins can view all inputs"
  on public.inputs for select
  using (public.is_admin(auth.uid()));

create policy "Users can create inputs for their opportunities"
  on public.inputs for insert
  with check (
    exists (
      select 1 from public.opportunities
      where id = opportunity_id
      and (responsible_user_id = auth.uid() or created_by = auth.uid())
    )
    and auth.uid() = uploaded_by
  );

create policy "Users can delete inputs from their opportunities"
  on public.inputs for delete
  using (
    exists (
      select 1 from public.opportunities
      where id = opportunity_id
      and (responsible_user_id = auth.uid() or created_by = auth.uid())
    )
  );

-- Create artifacts table
create table public.artifacts (
  id bigserial primary key,
  opportunity_id bigint not null references public.opportunities(id) on delete cascade,
  file_name varchar(200) not null,
  gdrive_file_id varchar(200) not null,
  gdrive_web_url varchar(500) not null,
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamp with time zone default now()
);

-- Enable RLS on artifacts
alter table public.artifacts enable row level security;

-- Artifacts RLS policies
create policy "Users can view artifacts for their opportunities"
  on public.artifacts for select
  using (
    exists (
      select 1 from public.opportunities
      where id = opportunity_id
      and (responsible_user_id = auth.uid() or created_by = auth.uid())
    )
  );

create policy "Admins can view all artifacts"
  on public.artifacts for select
  using (public.is_admin(auth.uid()));

create policy "Users can create artifacts for their opportunities"
  on public.artifacts for insert
  with check (
    exists (
      select 1 from public.opportunities
      where id = opportunity_id
      and (responsible_user_id = auth.uid() or created_by = auth.uid())
    )
    and auth.uid() = generated_by
  );

create policy "Users can delete artifacts from their opportunities"
  on public.artifacts for delete
  using (
    exists (
      select 1 from public.opportunities
      where id = opportunity_id
      and (responsible_user_id = auth.uid() or created_by = auth.uid())
    )
  );

-- Create function to handle new user registration
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email
  );
  return new;
end;
$$;

-- Create trigger for new user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create update timestamp function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Add update triggers
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

create trigger update_clients_updated_at
  before update on public.clients
  for each row execute function public.update_updated_at_column();

create trigger update_opportunities_updated_at
  before update on public.opportunities
  for each row execute function public.update_updated_at_column();