-- PARTE 1 (rodar PRIMEIRO) — Autorização do usuário para o ADM acessar dados do cadastro na consultoria.
-- Base legal: LGPD art. 7º, I (consentimento específico, revogável).
-- É aditiva: cria tabelas e funções novas e NÃO altera nada que já funciona.
-- Onde rodar: Supabase > projeto "transformare-portal" > SQL Editor > New query > colar tudo > Run.

create table if not exists public.consultoria_acessos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios_perfil(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','autorizado','recusado','revogado')),
  solicitado_em timestamptz not null default now(),
  respondido_em timestamptz,
  versao_texto text
);

-- no máximo um pedido "em aberto" (pendente ou autorizado) por usuário; o histórico fica guardado
create unique index if not exists consultoria_acessos_ativo_uk
  on public.consultoria_acessos (usuario_id) where status in ('pendente','autorizado');

alter table public.consultoria_acessos enable row level security;

drop policy if exists "usuario le proprias autorizacoes" on public.consultoria_acessos;
create policy "usuario le proprias autorizacoes" on public.consultoria_acessos
  for select to authenticated using (auth.uid() = usuario_id);

drop policy if exists "admin le autorizacoes" on public.consultoria_acessos;
create policy "admin le autorizacoes" on public.consultoria_acessos
  for select to authenticated using (public.is_admin());
-- sem policies de insert/update/delete: a escrita só acontece pelas funções abaixo

-- registro de cada vez que o ADM abre os dados autorizados (o usuário pode ver)
create table if not exists public.consultoria_consultas (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios_perfil(id) on delete cascade,
  consultado_em timestamptz not null default now()
);
alter table public.consultoria_consultas enable row level security;

drop policy if exists "usuario le proprias consultas" on public.consultoria_consultas;
create policy "usuario le proprias consultas" on public.consultoria_consultas
  for select to authenticated using (auth.uid() = usuario_id);

drop policy if exists "admin le consultas" on public.consultoria_consultas;
create policy "admin le consultas" on public.consultoria_consultas
  for select to authenticated using (public.is_admin());

-- ADM pede autorização
create or replace function public.consultoria_solicitar(p_usuario uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if not exists (select 1 from public.usuarios_perfil where id = p_usuario) then
    raise exception 'Usuário não encontrado';
  end if;
  select status into v from public.consultoria_acessos
    where usuario_id = p_usuario and status in ('pendente','autorizado');
  if v is not null then return v; end if;
  insert into public.consultoria_acessos (usuario_id) values (p_usuario);
  return 'pendente';
end $$;

-- usuário responde (autoriza ou recusa) o pedido pendente dele
create or replace function public.consultoria_responder(p_autoriza boolean, p_versao text)
returns text language plpgsql security definer set search_path = '' as $$
declare novo text;
begin
  if auth.uid() is null then raise exception 'Faça login' using errcode = '42501'; end if;
  novo := case when p_autoriza then 'autorizado' else 'recusado' end;
  update public.consultoria_acessos
     set status = novo, respondido_em = now(), versao_texto = p_versao
   where usuario_id = auth.uid() and status = 'pendente';
  if not found then raise exception 'Nenhum pedido pendente'; end if;
  return novo;
end $$;

-- usuário revoga a autorização quando quiser
create or replace function public.consultoria_revogar()
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login' using errcode = '42501'; end if;
  update public.consultoria_acessos
     set status = 'revogado', respondido_em = now()
   where usuario_id = auth.uid() and status = 'autorizado';
  if not found then raise exception 'Nenhuma autorização ativa'; end if;
  return 'revogado';
end $$;

-- ADM lê os dados reservados SOMENTE de quem autorizou (e fica registrado)
create or replace function public.admin_cadastro_consultoria(p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if not exists (select 1 from public.consultoria_acessos where usuario_id = p_usuario and status = 'autorizado') then
    raise exception 'Sem autorização do usuário' using errcode = '42501';
  end if;
  insert into public.consultoria_consultas (usuario_id) values (p_usuario);
  return (select jsonb_build_object(
    'whatsapp', whatsapp, 'registro', registro, 'cnpj', cnpj, 'empresa', empresa,
    'rem_min', rem_min, 'rem_tipo', rem_tipo, 'meta_mensal', meta_mensal,
    'regime', regime, 'complemento', complemento)
    from public.usuarios_perfil where id = p_usuario);
end $$;

-- lista do painel ADM: só as colunas básicas (as mesmas que a tela já usava)
create or replace function public.admin_lista_usuarios()
returns setof jsonb language plpgsql security definer stable set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  return query
    select jsonb_build_object(
      'id', u.id, 'nome', u.nome, 'email', u.email, 'uf', u.uf, 'cidade', u.cidade, 'teste', u.teste,
      'profs', u.profs, 'mods', u.mods, 'plano', u.plano, 'criado_em', u.criado_em,
      'abrangencias', u.abrangencias, 'escolaridade', u.escolaridade,
      'anos_experiencia', u.anos_experiencia, 'atuacao', u.atuacao,
      'especialidades', u.especialidades, 'formatos', u.formatos)
    from public.usuarios_perfil u
    order by u.criado_em desc;
end $$;

-- ADM muda plano / marca teste sem precisar ler a linha inteira
create or replace function public.admin_atualizar_perfil(p_id uuid, p_plano text default null, p_teste boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  update public.usuarios_perfil
     set plano = coalesce(p_plano, plano), teste = coalesce(p_teste, teste)
   where id = p_id;
end $$;

revoke all on function public.consultoria_solicitar(uuid) from public, anon;
revoke all on function public.consultoria_responder(boolean, text) from public, anon;
revoke all on function public.consultoria_revogar() from public, anon;
revoke all on function public.admin_cadastro_consultoria(uuid) from public, anon;
revoke all on function public.admin_lista_usuarios() from public, anon;
revoke all on function public.admin_atualizar_perfil(uuid, text, boolean) from public, anon;
grant execute on function public.consultoria_solicitar(uuid) to authenticated;
grant execute on function public.consultoria_responder(boolean, text) to authenticated;
grant execute on function public.consultoria_revogar() to authenticated;
grant execute on function public.admin_cadastro_consultoria(uuid) to authenticated;
grant execute on function public.admin_lista_usuarios() to authenticated;
grant execute on function public.admin_atualizar_perfil(uuid, text, boolean) to authenticated;
