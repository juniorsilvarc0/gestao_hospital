/**
 * Seed Fase 1 + Fase 2 (Auth Trilha A).
 *
 * Popula o mínimo necessário para o sistema autenticar:
 *   - 1 tenant `dev` (codigo = 'dev')
 *   - ~15 permissões essenciais (cadastros básicos)
 *   - 8 perfis padrão (ADMIN, MEDICO, ENFERMEIRO, FARMACEUTICO,
 *     RECEPCAO, FATURAMENTO, AUDITOR, FINANCEIRO)
 *   - ADMIN recebe TODAS as permissões
 *   - 1 usuário admin (admin@hms.local) com `precisa_trocar_senha=true`
 *
 * RLS-aware (Fase 2): a partir do P0 de auditoria/RLS, a app conecta
 * como `hms_app` (NOSUPERUSER, NOBYPASSRLS). Tabelas com `tenant_id`
 * (`usuarios`, `perfis`) exigem `SET LOCAL app.current_tenant_id`
 * dentro de uma transação para que INSERT/SELECT funcione.
 *
 * Estratégia:
 *   - tenants: sem RLS → upsert direto.
 *   - permissoes: catálogo global → sem RLS → upsert direto.
 *   - perfis + usuarios + joins: dentro de `$transaction` com SET LOCAL.
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
const TENANT_CODIGO = 'dev';
const TENANT_CNPJ = '00.000.000/0001-91';

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
  {
    recurso: 'prestadores',
    acao: 'delete',
    descricao: 'Soft-delete de prestadores',
  },
  {
    recurso: 'especialidades',
    acao: 'read',
    descricao: 'Consultar catálogo CBOS de especialidades',
  },
  {
    recurso: 'especialidades',
    acao: 'write',
    descricao: 'Cadastrar/editar especialidades CBOS (admin)',
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
  {
    recurso: 'tabelas-procedimentos',
    acao: 'read',
    descricao: 'Consultar catálogo TUSS/CBHPM/SUS',
  },
  {
    recurso: 'tabelas-procedimentos',
    acao: 'write',
    descricao: 'Editar catálogo e importar TUSS/CBHPM (admin)',
  },
  {
    recurso: 'tabelas-precos',
    acao: 'read',
    descricao: 'Consultar tabelas de preços',
  },
  {
    recurso: 'tabelas-precos',
    acao: 'write',
    descricao: 'Criar/editar tabelas de preços, itens e vínculos com convênio',
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
  console.warn('[seed] Starting Fase 1+2 seed (idempotent, RLS-aware)...');

  // ── Tenants (sem RLS — upsert direto) ──
  const tenant = await prisma.tenant.upsert({
    where: { cnpj: TENANT_CNPJ },
    update: { codigo: TENANT_CODIGO },
    create: {
      cnpj: TENANT_CNPJ,
      codigo: TENANT_CODIGO,
      razaoSocial: 'Hospital Dev',
      nomeFantasia: 'HMS-BR Dev',
      cnes: '0000000',
      configuracoes: { codigo: TENANT_CODIGO, timezone: 'America/Sao_Paulo' },
    },
  });
  console.warn(
    `[seed] tenant id=${tenant.id} codigo=${tenant.codigo} (${tenant.razaoSocial}) ok`,
  );

  // ── Permissões (catálogo global, sem RLS) ──
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

  // ── Perfis + Usuário admin + joins (RLS) ──
  // Toda escrita em `perfis` e `usuarios` precisa de `SET LOCAL`.
  // perfis_permissoes não tem tenant_id direto (sem RLS) mas vai junto
  // por simplicidade e atomicidade.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_tenant_id = '${tenant.id.toString()}'`,
    );

    for (const profile of PROFILES) {
      await tx.perfil.upsert({
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

    const adminProfile = await tx.perfil.findFirstOrThrow({
      where: { tenantId: tenant.id, codigo: 'ADMIN' },
    });

    // perfis_permissoes — sem tenant_id, sem RLS direta. Mas mantemos
    // dentro da transação para atomicidade.
    for (const permission of allPermissions) {
      await tx.perfilPermissao.upsert({
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
      });
    }
    console.warn(
      `[seed] perfis_permissoes ADMIN <- ${allPermissions.length} ok`,
    );

    // Usuário admin com Argon2id (m=64MB, t=3, p=4 — RNF-002).
    const senhaHash = await argon2.hash(ADMIN_TEMP_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 4,
    });

    const adminUser = await tx.usuario.upsert({
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
    console.warn(
      `[seed] usuario admin id=${adminUser.id} (${adminUser.email}) ok`,
    );

    await tx.usuarioPerfil.upsert({
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
  });

  console.warn('[seed] Done.');
  console.warn('');
  console.warn('  Login:');
  console.warn(`    tenantCode: ${TENANT_CODIGO}`);
  console.warn(`    email:      ${ADMIN_EMAIL}`);
  console.warn(`    password:   ${ADMIN_TEMP_PASSWORD}`);
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
