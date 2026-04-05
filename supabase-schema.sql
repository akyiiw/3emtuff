-- ==========================================
-- 3EMTuff - Supabase Schema (v3 - com profiles)
-- ==========================================
-- Rode isso no SQL Editor do seu projeto Supabase
-- ATENÇÃO: Isso vai APAGAR todos os dados existentes

-- Apaga tabelas antigas
drop table if exists item_links cascade;
drop table if exists items cascade;
drop table if exists task_done cascade;

-- Perfis de usuários (público, espelha auth.users)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger: cria perfil automaticamente quando alguém se registra
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Usuário')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS em profiles
alter table profiles enable row level security;

create policy "Profiles são visíveis por todos autenticados"
  on profiles for select to authenticated using (true);

create policy "Usuário pode editar o próprio perfil"
  on profiles for update to authenticated using (auth.uid() = id);

-- Itens (atividades compartilhadas)
create table items (
  id uuid default gen_random_uuid() primary key,
  subject_id text not null,
  text text not null,
  description text,
  due_date date,
  created_by uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- Links anexados
create table item_links (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references items(id) on delete cascade not null,
  url text not null,
  label text,
  created_at timestamptz default now()
);

-- Conclusão individual
create table task_done (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references items(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  done_at timestamptz default now(),
  unique(item_id, user_id)
);

-- RLS
alter table items enable row level security;

create policy "Items viewable by all authenticated users"
  on items for select to authenticated using (true);
create policy "Any authenticated user can create items"
  on items for insert to authenticated with check (true);
create policy "Any authenticated user can update items"
  on items for update to authenticated using (true);
create policy "Only creator can delete items"
  on items for delete to authenticated using (auth.uid() = created_by);

alter table item_links enable row level security;

create policy "Links viewable by all authenticated"
  on item_links for select to authenticated using (true);
create policy "Any authenticated user can create links"
  on item_links for insert to authenticated with check (true);
create policy "Any authenticated user can update links"
  on item_links for update to authenticated using (true);
create policy "Any authenticated user can delete links"
  on item_links for delete to authenticated using (true);

alter table task_done enable row level security;

create policy "task_done viewable by all authenticated"
  on task_done for select to authenticated using (true);
create policy "Any authenticated user can toggle own completion"
  on task_done for all to authenticated
  using (true)
  with check (user_id = auth.uid());

-- Indexes
create index idx_items_subject on items(subject_id);
create index idx_items_due_date on items(due_date);
create index idx_items_created_by on items(created_by);
create index idx_task_done_item on task_done(item_id);
create index idx_task_done_user on task_done(user_id);

-- ==========================================
-- FÓRUM
-- ==========================================

-- Posts do fórum
create table forum_posts (
  id uuid default gen_random_uuid() primary key,
  subject_id text,  -- NULL = geral
  item_id uuid references items(id) on delete set null,
  title text not null,
  body text,
  post_type text not null default 'discussion', -- discussion, answer, resource, summary
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index
create index idx_forum_posts_item on forum_posts(item_id);

-- Comentários em posts
create table forum_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references forum_posts(id) on delete cascade not null,
  body text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS Fórum
alter table forum_posts enable row level security;
create policy "Forum posts viewable by all authenticated" on forum_posts for select to authenticated using (true);
create policy "Any authenticated user can create posts" on forum_posts for insert to authenticated with check (true);
create policy "Any authenticated user can update their posts" on forum_posts for update to authenticated using (auth.uid() = user_id);
create policy "Creator can delete their posts" on forum_posts for delete to authenticated using (auth.uid() = user_id);

alter table forum_comments enable row level security;
create policy "Forum comments viewable by all authenticated" on forum_comments for select to authenticated using (true);
create policy "Any authenticated user can create comments" on forum_comments for insert to authenticated with check (true);
create policy "Any authenticated user can update their comments" on forum_comments for update to authenticated using (auth.uid() = user_id);
create policy "Creator can delete their comments" on forum_comments for delete to authenticated using (auth.uid() = user_id);

-- Indexes
create index idx_forum_posts_subject on forum_posts(subject_id);
create index idx_forum_posts_type on forum_posts(post_type);
create index idx_forum_comments_post on forum_comments(post_id);
