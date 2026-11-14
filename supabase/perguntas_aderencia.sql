-- Perguntas Sim/Não derivadas dos pontos de atenção do edital (só assinantes veem as aprovadas).
alter table public.editais add column if not exists perguntas_aderencia jsonb not null default '[]'::jsonb;
