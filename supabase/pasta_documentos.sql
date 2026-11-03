-- Pasta de documentos no Google Drive, por cliente — USO INTERNO da Transformare.
-- O site só GUARDA o link e com qual e-mail a pasta foi compartilhada (como Editor).
-- A pasta é criada e compartilhada no próprio Google Drive. O cliente NÃO vê este registro no site:
-- só o ADM lê e altera (o cliente acessa a pasta pelo Drive, com o e-mail em que ela foi compartilhada).
-- É aditiva: cria uma tabela nova e não altera nada que já funciona.
-- Onde rodar: Supabase > projeto "transformare-portal" > SQL Editor > New query > colar tudo > Run.

create table if not exists public.pastas_documentos (
  usuario_id uuid primary key references public.usuarios_perfil(id) on delete cascade,
  url text not null check (url ~* '^https://(drive|docs)\.google\.com/'),
  compartilhado_com text,                 -- e-mail que recebeu acesso de Editor (o do cadastro ou outro); vazio = ainda não compartilhada
  atualizado_em timestamptz not null default now()
);

alter table public.pastas_documentos enable row level security;

-- garante que o cliente não leia o próprio registro (caso uma versão anterior tenha criado essa regra)
drop policy if exists "usuario le propria pasta" on public.pastas_documentos;

drop policy if exists "admin le pastas" on public.pastas_documentos;
create policy "admin le pastas" on public.pastas_documentos
  for select to authenticated using (public.is_admin());

drop policy if exists "admin cria pastas" on public.pastas_documentos;
create policy "admin cria pastas" on public.pastas_documentos
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin atualiza pastas" on public.pastas_documentos;
create policy "admin atualiza pastas" on public.pastas_documentos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin exclui pastas" on public.pastas_documentos;
create policy "admin exclui pastas" on public.pastas_documentos
  for delete to authenticated using (public.is_admin());
