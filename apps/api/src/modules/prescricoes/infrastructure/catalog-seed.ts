/**
 * `seedCatalogos()` — popula `principios_ativos` e
 * `interacoes_medicamentosas` com um mini-catálogo brasileiro inicial.
 *
 * - Idempotente: `ON CONFLICT DO NOTHING` em todos os inserts.
 * - Tabelas globais (sem `tenant_id`, sem RLS) — não precisa de SET
 *   LOCAL.
 * - Roda dentro do `seed.ts` (apps/api/prisma/seed.ts) ao final OU via
 *   `pnpm --filter @hms-br/api exec ts-node ...` (idem outras seeds).
 *
 * Fonte: BNF 78 (2019), Stockley's Drug Interactions (2019), bula
 * ANVISA 2024 — referências para a Fase 13 (hardening) substituir por
 * lib externa (Memed / Drugs.com).
 */
import type { PrismaClient } from '@prisma/client';

interface PrincipioSeed {
  nome: string;
  nomeIngles?: string;
  classeAtc?: string;
  /** mg/dia adulto. Quando aplicável. */
  doseMaxDia?: number;
  unidadeDose?: string;
  observacao?: string;
}

interface InteracaoSeed {
  /** principios.nome do "primeiro" lado. */
  a: string;
  b: string;
  severidade: 'LEVE' | 'MODERADA' | 'GRAVE' | 'CONTRAINDICADA';
  descricao: string;
  fonte: string;
}

const PRINCIPIOS: ReadonlyArray<PrincipioSeed> = [
  {
    nome: 'Paracetamol',
    nomeIngles: 'Paracetamol',
    classeAtc: 'N02BE01',
    doseMaxDia: 4000,
    unidadeDose: 'mg',
    observacao: 'Dose máx adulto 4g/dia (3g hepatopata).',
  },
  {
    nome: 'Dipirona',
    classeAtc: 'N02BB02',
    doseMaxDia: 4000,
    unidadeDose: 'mg',
  },
  {
    nome: 'Amoxicilina',
    classeAtc: 'J01CA04',
    doseMaxDia: 3000,
    unidadeDose: 'mg',
  },
  {
    nome: 'Captopril',
    classeAtc: 'C09AA01',
    doseMaxDia: 150,
    unidadeDose: 'mg',
  },
  {
    nome: 'Losartana',
    classeAtc: 'C09CA01',
    doseMaxDia: 100,
    unidadeDose: 'mg',
  },
  {
    nome: 'Metformina',
    classeAtc: 'A10BA02',
    doseMaxDia: 2550,
    unidadeDose: 'mg',
  },
  {
    nome: 'Omeprazol',
    classeAtc: 'A02BC01',
    doseMaxDia: 80,
    unidadeDose: 'mg',
  },
  {
    nome: 'Sinvastatina',
    classeAtc: 'C10AA01',
    doseMaxDia: 40,
    unidadeDose: 'mg',
  },
  {
    nome: 'AAS',
    nomeIngles: 'Acetylsalicylic acid',
    classeAtc: 'B01AC06',
    doseMaxDia: 4000,
    unidadeDose: 'mg',
    observacao: 'Antiplaquetário 100mg/dia; analgésico até 4g/dia.',
  },
  {
    nome: 'Warfarina',
    classeAtc: 'B01AA03',
    doseMaxDia: 15,
    unidadeDose: 'mg',
    observacao: 'Faixa terapêutica estreita — INR alvo 2-3.',
  },
  {
    nome: 'Varfarina',
    classeAtc: 'B01AA03',
    doseMaxDia: 15,
    unidadeDose: 'mg',
    observacao: 'Sinônimo brasileiro de Warfarina.',
  },
  {
    nome: 'Digoxina',
    classeAtc: 'C01AA05',
    doseMaxDia: 0.25,
    unidadeDose: 'mg',
  },
  {
    nome: 'Furosemida',
    classeAtc: 'C03CA01',
    doseMaxDia: 600,
    unidadeDose: 'mg',
  },
  {
    nome: 'Metoprolol',
    classeAtc: 'C07AB02',
    doseMaxDia: 400,
    unidadeDose: 'mg',
  },
  {
    nome: 'Fluoxetina',
    classeAtc: 'N06AB03',
    doseMaxDia: 80,
    unidadeDose: 'mg',
  },
  {
    nome: 'Diazepam',
    classeAtc: 'N05BA01',
    doseMaxDia: 40,
    unidadeDose: 'mg',
    observacao: 'Portaria 344 — controlado.',
  },
  {
    nome: 'Morfina',
    classeAtc: 'N02AA01',
    doseMaxDia: 360,
    unidadeDose: 'mg',
    observacao: 'Portaria 344 — opioide A1.',
  },
  {
    nome: 'Dexametasona',
    classeAtc: 'H02AB02',
    doseMaxDia: 24,
    unidadeDose: 'mg',
  },
  {
    nome: 'Prednisona',
    classeAtc: 'H02AB07',
    doseMaxDia: 80,
    unidadeDose: 'mg',
  },
  {
    nome: 'Hidroclorotiazida',
    classeAtc: 'C03AA03',
    doseMaxDia: 50,
    unidadeDose: 'mg',
  },
  {
    nome: 'Espironolactona',
    classeAtc: 'C03DA01',
    doseMaxDia: 400,
    unidadeDose: 'mg',
  },
  {
    nome: 'Tramadol',
    classeAtc: 'N02AX02',
    doseMaxDia: 400,
    unidadeDose: 'mg',
    observacao: 'Portaria 344 — opioide A2.',
  },
];

const INTERACOES: ReadonlyArray<InteracaoSeed> = [
  {
    a: 'Warfarina',
    b: 'AAS',
    severidade: 'GRAVE',
    descricao: 'Aumento sinérgico do risco hemorrágico (anticoagulante + antiplaquetário).',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Warfarina',
    b: 'Dipirona',
    severidade: 'GRAVE',
    descricao: 'Dipirona potencializa varfarina; risco de sangramento. Monitorar INR.',
    fonte: 'BNF 78',
  },
  {
    a: 'Warfarina',
    b: 'Omeprazol',
    severidade: 'MODERADA',
    descricao: 'Omeprazol pode aumentar nível de varfarina via CYP2C19.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Varfarina',
    b: 'AAS',
    severidade: 'GRAVE',
    descricao: 'Aumento sinérgico do risco hemorrágico.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Varfarina',
    b: 'Dipirona',
    severidade: 'GRAVE',
    descricao: 'Dipirona potencializa varfarina; risco de sangramento.',
    fonte: 'BNF 78',
  },
  {
    a: 'Varfarina',
    b: 'Omeprazol',
    severidade: 'MODERADA',
    descricao: 'Omeprazol pode aumentar nível de varfarina via CYP2C19.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Captopril',
    b: 'Espironolactona',
    severidade: 'GRAVE',
    descricao: 'Risco de hipercalemia (IECA + diurético poupador de potássio).',
    fonte: 'BNF 78',
  },
  {
    a: 'Losartana',
    b: 'Espironolactona',
    severidade: 'GRAVE',
    descricao: 'Risco de hipercalemia (BRA + poupador de potássio).',
    fonte: 'BNF 78',
  },
  {
    a: 'Fluoxetina',
    b: 'Tramadol',
    severidade: 'GRAVE',
    descricao: 'Risco de síndrome serotoninérgica (ISRS + opioide serotoninérgico).',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Fluoxetina',
    b: 'Diazepam',
    severidade: 'MODERADA',
    descricao: 'Fluoxetina inibe CYP3A4/2C19, prolongando a meia-vida do diazepam.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Digoxina',
    b: 'Furosemida',
    severidade: 'MODERADA',
    descricao: 'Hipocalemia induzida por furosemida potencializa toxicidade da digoxina.',
    fonte: 'BNF 78',
  },
  {
    a: 'Digoxina',
    b: 'Hidroclorotiazida',
    severidade: 'MODERADA',
    descricao: 'Hipocalemia induzida por tiazídico potencializa toxicidade da digoxina.',
    fonte: 'BNF 78',
  },
  {
    a: 'Captopril',
    b: 'Furosemida',
    severidade: 'LEVE',
    descricao: 'Possível hipotensão de primeira dose ao iniciar IECA em paciente diuretizado.',
    fonte: 'BNF 78',
  },
  {
    a: 'Sinvastatina',
    b: 'Fluoxetina',
    severidade: 'LEVE',
    descricao: 'Possível aumento de níveis de sinvastatina via CYP3A4.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Metformina',
    b: 'Furosemida',
    severidade: 'LEVE',
    descricao: 'Furosemida pode mascarar hipoglicemia em diabético.',
    fonte: 'BNF 78',
  },
  {
    a: 'Morfina',
    b: 'Diazepam',
    severidade: 'GRAVE',
    descricao: 'Depressão respiratória aditiva (opioide + benzodiazepínico).',
    fonte: 'BNF 78',
  },
  {
    a: 'Tramadol',
    b: 'Diazepam',
    severidade: 'MODERADA',
    descricao: 'Sedação aditiva e risco de depressão respiratória.',
    fonte: 'BNF 78',
  },
  {
    a: 'Prednisona',
    b: 'AAS',
    severidade: 'MODERADA',
    descricao: 'Aumento do risco de úlcera gastroduodenal e sangramento.',
    fonte: 'BNF 78',
  },
  {
    a: 'Dexametasona',
    b: 'AAS',
    severidade: 'MODERADA',
    descricao: 'Aumento do risco de úlcera gastroduodenal e sangramento.',
    fonte: 'BNF 78',
  },
  {
    a: 'Captopril',
    b: 'Hidroclorotiazida',
    severidade: 'LEVE',
    descricao: 'Combinação útil; iniciar com cautela pelo risco de hipotensão.',
    fonte: 'BNF 78',
  },
  {
    a: 'Losartana',
    b: 'Hidroclorotiazida',
    severidade: 'LEVE',
    descricao: 'Combinação amplamente usada; monitorar potássio e função renal.',
    fonte: 'BNF 78',
  },
  {
    a: 'Metoprolol',
    b: 'Furosemida',
    severidade: 'LEVE',
    descricao: 'Combinação cardiovascular comum; vigilância de hipotensão.',
    fonte: 'BNF 78',
  },
  {
    a: 'Amoxicilina',
    b: 'Warfarina',
    severidade: 'MODERADA',
    descricao: 'Antibióticos podem aumentar o efeito da varfarina via flora intestinal.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Amoxicilina',
    b: 'Varfarina',
    severidade: 'MODERADA',
    descricao: 'Antibióticos podem aumentar o efeito da varfarina via flora intestinal.',
    fonte: 'Stockley 2019',
  },
  {
    a: 'Morfina',
    b: 'Tramadol',
    severidade: 'CONTRAINDICADA',
    descricao: 'Combinação de dois opioides com risco grave de depressão respiratória — evitar.',
    fonte: 'BNF 78',
  },
];

export async function seedCatalogos(prisma: PrismaClient): Promise<void> {
  // 1. Princípios ativos.
  for (const p of PRINCIPIOS) {
    await prisma.$executeRaw`
      INSERT INTO principios_ativos (nome, nome_ingles, classe_atc, dose_max_dia, unidade_dose, observacao, ativo)
      VALUES (
        ${p.nome},
        ${p.nomeIngles ?? null},
        ${p.classeAtc ?? null},
        ${p.doseMaxDia ?? null},
        ${p.unidadeDose ?? null},
        ${p.observacao ?? null},
        TRUE
      )
      ON CONFLICT (nome) DO NOTHING
    `;
  }

  // 2. Interações.
  for (const i of INTERACOES) {
    // Resolve IDs (lookup pelo nome). ON CONFLICT (principio_a,
    // principio_b) cuida da idempotência, mas a constraint
    // `ck_interacao_diferentes` exige diferentes — garantimos via lookup.
    const ids = await prisma.$queryRaw<
      { id_a: bigint | null; id_b: bigint | null }[]
    >`
      SELECT
        (SELECT id FROM principios_ativos WHERE nome = ${i.a} LIMIT 1) AS id_a,
        (SELECT id FROM principios_ativos WHERE nome = ${i.b} LIMIT 1) AS id_b
    `;
    const row = ids[0];
    if (
      row === undefined ||
      row.id_a === null ||
      row.id_b === null ||
      row.id_a === row.id_b
    ) {
      continue;
    }
    // Para evitar entrar duas vezes na unique (a,b) e (b,a), guardamos
    // sempre com `principio_a < principio_b`.
    const [a, b] =
      row.id_a < row.id_b ? [row.id_a, row.id_b] : [row.id_b, row.id_a];
    await prisma.$executeRaw`
      INSERT INTO interacoes_medicamentosas
        (principio_a, principio_b, severidade, descricao, fonte, ativa)
      VALUES (
        ${a}::bigint,
        ${b}::bigint,
        ${i.severidade}::enum_interacao_severidade,
        ${i.descricao},
        ${i.fonte},
        TRUE
      )
      ON CONFLICT (principio_a, principio_b) DO NOTHING
    `;
  }
}
