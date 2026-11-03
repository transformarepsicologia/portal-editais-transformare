-- "Pasta do edital": link da pasta do Google Drive com os documentos, por EDITAL — USO INTERNO da Transformare.
-- O site só GUARDA o link que o ADM cola (a pasta é criada e compartilhada no próprio Google Drive).
-- O item aparece acima do checklist do edital, só para o ADM. O cliente NÃO vê: só o ADM lê e altera a tabela.
-- É aditiva: cria uma tabela nova e não altera nada que já funciona.
-- Onde rodar: Supabase > projeto "transformare-portal" > SQL Editor > New query > colar tudo > Run.

create table if not exists public.pastas_edital (
  edital_id bigint primary key references public.editais(id) on delete cascade,
  url text not null check (url ~* '^https://(drive|docs)\.google\.com/'),
  atualizado_em timestamptz not null default now()
);

alter table public.pastas_edital enable row level security;

drop policy if exists "admin gerencia pasta do edital" on public.pastas_edital;
create policy "admin gerencia pasta do edital" on public.pastas_edital
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- sem nenhuma regra para o cliente: ele não lê nem altera este registro
