-- Fase 3 / fix — Seed das permissões de cadastros + grant ao perfil ADMIN.
-- As trilhas A-D criaram endpoints com @RequirePermission(<recurso>,<acao>)
-- mas só pacientes:delete + lgpd:* foram catalogados. Sem isto, ADMIN
-- recebe 403 em todas as operações de cadastro.

INSERT INTO permissoes (recurso, acao, descricao) VALUES
  ('pacientes',                  'read',   'Ler dados de paciente'),
  ('pacientes',                  'write',  'Criar/atualizar paciente + vínculos'),
  ('prestadores',                'read',   'Ler prestadores'),
  ('prestadores',                'write',  'Criar/atualizar prestador'),
  ('prestadores',                'delete', 'Soft-delete prestador'),
  ('convenios',                  'read',   'Ler convênios/planos/condições'),
  ('convenios',                  'write',  'Criar/atualizar convênios/planos/condições'),
  ('convenios',                  'delete', 'Soft-delete convênio'),
  ('especialidades',             'read',   'Ler especialidades'),
  ('especialidades',             'write',  'Cadastrar/editar especialidade'),
  ('procedimentos',              'read',   'Ler tabelas de procedimentos'),
  ('procedimentos',              'write',  'Criar/atualizar procedimento'),
  ('procedimentos',              'import', 'Importar TUSS/CBHPM/CID/CBO'),
  ('tabelas_precos',             'read',   'Ler tabelas de preços'),
  ('tabelas_precos',             'write',  'Criar/atualizar tabela de preços'),
  ('estrutura_fisica',           'read',   'Ler unidades/setores/leitos/salas'),
  ('estrutura_fisica',           'write',  'Criar/atualizar unidades/setores/leitos/salas'),
  ('estrutura_fisica',           'delete', 'Remover unidades/setores/leitos/salas'),
  ('leitos',                     'status', 'Mudar status de leito (transição)')
ON CONFLICT (recurso, acao) DO NOTHING;

INSERT INTO perfis_permissoes (perfil_id, permissao_id)
SELECT p.id, perm.id
  FROM perfis p
  CROSS JOIN permissoes perm
 WHERE p.codigo = 'ADMIN'
   AND (perm.recurso, perm.acao) IN (
        ('pacientes',                  'read'),
        ('pacientes',                  'write'),
        ('prestadores',                'read'),
        ('prestadores',                'write'),
        ('prestadores',                'delete'),
        ('convenios',                  'read'),
        ('convenios',                  'write'),
        ('convenios',                  'delete'),
        ('especialidades',             'read'),
        ('especialidades',             'write'),
        ('procedimentos',              'read'),
        ('procedimentos',              'write'),
        ('procedimentos',              'import'),
        ('tabelas_precos',             'read'),
        ('tabelas_precos',             'write'),
        ('estrutura_fisica',           'read'),
        ('estrutura_fisica',           'write'),
        ('estrutura_fisica',           'delete'),
        ('leitos',                     'status')
   )
ON CONFLICT (perfil_id, permissao_id) DO NOTHING;
