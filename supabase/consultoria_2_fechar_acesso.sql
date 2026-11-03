-- PARTE 2 (rodar SÓ DEPOIS de a Parte 1 estar aplicada, o site novo estar no ar
-- e o painel ADM ter sido testado: lista de usuários, mudar plano, marcar teste).
--
-- Hoje o ADM consegue ler TODAS as colunas de todos os usuários direto pela API.
-- Esta parte deixa cada pessoa ler só o próprio perfil. O ADM passa a ver a lista básica
-- por admin_lista_usuarios() e os dados reservados só de quem autorizou, por admin_cadastro_consultoria().

drop policy if exists "usuario le proprio perfil" on public.usuarios_perfil;
create policy "usuario le proprio perfil" on public.usuarios_perfil
  for select using (auth.uid() = id);

-- Para desfazer (volta ao comportamento anterior), rodar:
-- drop policy if exists "usuario le proprio perfil" on public.usuarios_perfil;
-- create policy "usuario le proprio perfil" on public.usuarios_perfil
--   for select using ((auth.uid() = id) or ((auth.jwt() ->> 'email') = 'transformarepsicologia1@gmail.com'));
