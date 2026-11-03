-- Pasta de documentos no Google Drive: uma por CLIENTE e por EDITAL — USO INTERNO da Transformare.
-- O site só GUARDA o link e com qual e-mail a pasta foi compartilhada (como Editor).
-- A pasta é criada e compartilhada no próprio Google Drive. O bloco aparece no checklist do edital,
-- só para o ADM. O cliente NÃO vê este registro no site: só o ADM lê e altera a tabela.
-- É aditiva: cria uma tabela nova e não altera nada que já funciona.
-- Onde rodar: Supabase > projeto "transformare-portal" > SQL Editor > New query > colar tudo > Run.

create table if not exists public.pastas_documentos (
  usuario_id uuid not null references public.usuarios_perfil(id) on delete cascade,
  edital_id bigint not null references public.editais(id) on delete cascade,
  url text not null check (url ~* '^https://(drive|docs)\.google\.com/'),
  compartilhado_com text,                 -- e-mail que recebeu acesso de Editor (o do cadastro ou outro); vazio = ainda não compartilhada
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, edital_id)
);

create index if not exists pastas_documentos_edital_idx on public.pastas_documentos (edital_id);

alter table public.pastas_documentos enable row level security;

drop policy if exists "admin gerencia pastas" on public.pastas_documentos;
create policy "admin gerencia pastas" on public.pastas_documentos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- sem nenhuma regra para o cliente: ele não lê nem altera este registro
