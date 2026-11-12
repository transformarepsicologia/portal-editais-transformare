-- Prospecção a partir do edital: contatos passam a ter E-MAIL e cada envio registra o CANAL (whatsapp, email, instagram).
-- Só mexe nas tabelas de prospecção (uso do ADM). Não apaga dados.
-- Onde rodar: Supabase > projeto "transformare-portal" > SQL Editor > New query > colar tudo > Run.
-- (O Supabase pode avisar "operações destrutivas" por causa do drop constraint: é só trocar a regra antiga por uma nova, sem tocar nos dados.)

alter table public.prospectos_whatsapp add column if not exists email text;
alter table public.prospectos_envios add column if not exists canal text;

-- agora o contato pode ter só e-mail (antes exigia telefone ou instagram)
alter table public.prospectos_whatsapp drop constraint if exists prospectos_contato_check;
alter table public.prospectos_whatsapp add constraint prospectos_contato_check
  check (telefone is not null or instagram is not null or email is not null);

alter table public.prospectos_whatsapp drop constraint if exists prospectos_canal_check;
alter table public.prospectos_whatsapp add constraint prospectos_canal_check
  check (canal in ('whatsapp','instagram','email'));

-- o mesmo e-mail não vira dois contatos
create unique index if not exists prospectos_email_uk on public.prospectos_whatsapp (lower(email)) where email is not null;
