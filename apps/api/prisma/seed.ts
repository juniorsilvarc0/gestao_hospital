/**
 * Seed Fase 1.
 *
 * Popula o mínimo necessário para o sistema subir e a Fase 2
 * conseguir autenticar:
 *   - 1 tenant `dev`
 *   - ~15 permissões essenciais (cadastros básicos)
 *   - 8 perfis padrão (ADMIN, MEDICO, ENFERMEIRO, FARMACEUTICO,
 *     RECEPCAO, FATURAMENTO, AUDITOR, FINANCEIRO)
 *   - ADMIN recebe TODAS as permissões
 *   - 1 usuário admin (admin@hms.local) com `precisa_trocar_senha=true`
 *
 * Idempotente: re-rodar `make seed` não duplica registros (upsert).
 *
 * Senha hash com Argon2id (m=64MB, t=3, p=4) conforme RNF-002.
 */
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@hms.local';
const ADMIN_TEMP_PASSWORD = 'ChangeMe!2026';

const PERMISSIONS: ReadonlyArray<{
  recurso: string;
  acao: string;
  descricao: string;
}> = [
  { recurso: 'users', acao: 'read', descricao: 'Listar e visualizar usuários' },
  {
    recurso: 'users',
    acao: 'write',
    descricao: 'Criar/editar/desativar usuários',
  },
  { recurso: 'perfis', acao: 'read', descricao: 'Visualizar perfis (roles)' },
  { recurso: 'perfis', acao: 'write', descricao: 'Editar perfis e permissões' },
  { recurso: 'pacientes', acao: 'read', descricao: 'Consultar pacientes' },
  {
    recurso: 'pacientes',
    acao: 'write',
    descricao: 'Cadastrar/editar pacientes',
  },
  { recurso: 'prestadores', acao: 'read', descricao: 'Consultar prestadores' },
  {
    recurso: 'prestadores',
    acao: 'write',
    descricao: 'Cadastrar/editar prestadores',
  },
  { recurso: 'convenios', acao: 'read', descricao: 'Consultar convênios' },
  {
    recurso: 'convenios',
    acao: 'write',
    descricao: 'Cadastrar/editar convênios e planos',
  },
  {
    recurso: 'agendamento',
    acao: 'read',
    descricao: 'Consultar agenda',
  },
  {
    recurso: 'agendamento',
    acao: 'write',
    descricao: 'Agendar/reagendar/cancelar',
  },
  {
    recurso: 'atendimentos',
    acao: 'read',
    descricao: 'Consultar atendimentos',
  },
  {
    recurso: 'atendimentos',
    acao: 'write',
    descricao: 'Abrir/encerrar atendimentos',
  },
  {
    recurso: 'auditoria',
    acao: 'read',
    descricao: 'Consultar log de auditoria (LGPD)',
  },
];

const PROFILES: ReadonlyArray<{
  codigo: string;
  nome: string;
  descricao: string;
}> = [
  {
    codigo: 'ADMIN',
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema',
  },
  { codigo: 'MEDICO', nome: 'Médico', descricao: 'Profissional médico' },
  {
    codigo: 'ENFERMEIRO',
    nome: 'Enfermeiro',
    descricao: 'Equipe de enfermagem',
  },
  {
    codigo: 'FARMACEUTICO',
    nome: 'Farmacêutico',
    descricao: 'Equipe de farmácia hospitalar',
  },
  {
    codigo: 'RECEPCAO',
    nome: 'Recepção',
    descricao: 'Atendimento e check-in',
  },
  {
    codigo: 'FATURAMENTO',
    nome: 'Faturamento',
    descricao: 'Equipe de faturamento TISS/SUS',
  },
  {
    codigo: 'AUDITOR',
    nome: 'Auditor',
    descricao: 'Auditoria interna e LGPD',
  },
  {
    codigo: 'FINANCEIRO',
    nome: 'Financeiro',
    descricao: 'Tesouraria, repasse e cobrança',
  },
];

async function main(): Promise<void> {
  console.warn('[seed] Starting Fase 1 seed (idempotent)...');

  const tenant = await prisma.tenant.upsert({
    where: { cnpj: '00.000.000/0001-91' },
    update: {},
    create: {
      cnpj: '00.000.000/0001-91',
      razaoSocial: 'Hospital Dev',
      nomeFantasia: 'HMS-BR Dev',
      cnes: '0000000',
      configuracoes: { codigo: 'dev', timezone: 'America/Sao_Paulo' },
    },
  });
  console.warn(`[seed] tenant id=${tenant.id} (${tenant.razaoSocial}) ok`);

  // Permissões — upsert por (recurso, acao).
  for (const permission of PERMISSIONS) {
    await prisma.permissao.upsert({
      where: {
        recurso_acao: {
          recurso: permission.recurso,
          acao: permission.acao,
        },
      },
      update: { descricao: permission.descricao },
      create: permission,
    });
  }
  const allPermissions = await prisma.permissao.findMany();
  console.warn(`[seed] permissoes (${allPermissions.length}) ok`);

  // Perfis — upsert por (tenantId, codigo).
  for (const profile of PROFILES) {
    await prisma.perfil.upsert({
      where: {
        tenantId_codigo: {
          tenantId: tenant.id,
          codigo: profile.codigo,
        },
      },
      update: { nome: profile.nome, descricao: profile.descricao },
      create: { ...profile, tenantId: tenant.id },
    });
  }
  console.warn(`[seed] perfis (${PROFILES.length}) ok`);

  const adminProfile = await prisma.perfil.findUniqueOrThrow({
    where: {
      tenantId_codigo: { tenantId: tenant.id, codigo: 'ADMIN' },
    },
  });

  // Vincula TODAS as permissões ao perfil ADMIN.
  await prisma.$transaction(
    allPermissions.map((permission) =>
      prisma.perfilPermissao.upsert({
        where: {
          perfilId_permissaoId: {
            perfilId: adminProfile.id,
            permissaoId: permission.id,
          },
        },
        update: {},
        create: {
          perfilId: adminProfile.id,
          permissaoId: permission.id,
        },
      }),
    ),
  );
  console.warn(`[seed] perfis_permissoes ADMIN <- ${allPermissions.length} ok`);

  // Usuário admin com Argon2id.
  // m=64MB, t=3, p=4 (RNF-002).
  const senhaHash = await argon2.hash(ADMIN_TEMP_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 4,
  });

  const adminUser = await prisma.usuario.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: ADMIN_EMAIL },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: ADMIN_EMAIL,
      nome: 'Administrador HMS-BR',
      senhaHash,
      precisaTrocarSenha: true,
      ativo: true,
    },
  });
  console.warn(`[seed] usuario admin id=${adminUser.id} (${adminUser.email}) ok`);

  await prisma.usuarioPerfil.upsert({
    where: {
      usuarioId_perfilId: {
        usuarioId: adminUser.id,
        perfilId: adminProfile.id,
      },
    },
    update: {},
    create: {
      usuarioId: adminUser.id,
      perfilId: adminProfile.id,
    },
  });
  console.warn('[seed] usuarios_perfis admin -> ADMIN ok');

  console.warn('[seed] Done.');
  console.warn('');
  console.warn('  Login:');
  console.warn(`    email:    ${ADMIN_EMAIL}`);
  console.warn(`    password: ${ADMIN_TEMP_PASSWORD}`);
  console.warn('  (precisa trocar senha no primeiro login)');
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed] FAILED', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
