/**
 * Domínio puro do export LGPD — state machine do dual approval
 * (RN-LGP-04). Sem dependência de framework / DB.
 *
 * Lifecycle:
 *
 *   AGUARDANDO_APROVACAO_DPO
 *      │
 *      ├── aprovar_dpo ──→ AGUARDANDO_APROVACAO_SUPERVISOR
 *      │                         │
 *      │                         ├── aprovar_supervisor ──→ APROVADO
 *      │                         │                              │
 *      │                         │                              └── gerar ──→ GERANDO
 *      │                         │                                                 │
 *      │                         │                                                 └── concluir ──→ PRONTO_PARA_DOWNLOAD
 *      │                         │                                                                          │
 *      │                         │                                                                          ├── baixar ──→ BAIXADO
 *      │                         │                                                                          └── (>7 dias) ──→ EXPIRADO
 *      │                         └── rejeitar ──→ REJEITADO
 *      └── rejeitar ──→ REJEITADO
 *
 * Importante: o supervisor que aprova **não pode** ser o mesmo usuário
 * que aprovou como DPO (CHECK constraint `ck_lgpd_export_aprovadores_distintos`
 * no banco). A camada de aplicação valida antes de tocar no banco para
 * dar mensagem amigável; mesmo assim mantemos o CHECK como salvaguarda.
 */

export const LGPD_EXPORT_STATUSES = [
  'AGUARDANDO_APROVACAO_DPO',
  'AGUARDANDO_APROVACAO_SUPERVISOR',
  'APROVADO',
  'GERANDO',
  'PRONTO_PARA_DOWNLOAD',
  'BAIXADO',
  'EXPIRADO',
  'REJEITADO',
] as const;
export type LgpdExportStatus = (typeof LGPD_EXPORT_STATUSES)[number];

export const LGPD_EXPORT_FORMATOS = ['FHIR_JSON', 'JSON_RAW'] as const;
export type LgpdExportFormato = (typeof LGPD_EXPORT_FORMATOS)[number];

export type LgpdExportAction =
  | 'aprovar_dpo'
  | 'aprovar_supervisor'
  | 'rejeitar'
  | 'gerar'
  | 'concluir_geracao'
  | 'baixar'
  | 'expirar';

export interface TransitionResult {
  next: LgpdExportStatus | null;
  /** Motivo de bloqueio para apresentar ao operador (ou null se ok). */
  motivo: string | null;
}

const TERMINAL: ReadonlyArray<LgpdExportStatus> = [
  'BAIXADO',
  'EXPIRADO',
  'REJEITADO',
];

export function isTerminal(status: LgpdExportStatus): boolean {
  return TERMINAL.includes(status);
}

/** Status que ainda podem ser rejeitados. */
const REJEITAVEIS: ReadonlyArray<LgpdExportStatus> = [
  'AGUARDANDO_APROVACAO_DPO',
  'AGUARDANDO_APROVACAO_SUPERVISOR',
  'APROVADO',
];

/**
 * Calcula o próximo status conforme a action. Retorna `null` em `next`
 * quando a transição não é válida — o caller deve traduzir isso em 422.
 */
export function transition(
  current: LgpdExportStatus,
  action: LgpdExportAction,
): TransitionResult {
  if (action === 'rejeitar') {
    if (REJEITAVEIS.includes(current)) {
      return { next: 'REJEITADO', motivo: null };
    }
    return {
      next: null,
      motivo: `Não é possível rejeitar export em status ${current}.`,
    };
  }

  if (action === 'expirar') {
    if (current === 'PRONTO_PARA_DOWNLOAD') {
      return { next: 'EXPIRADO', motivo: null };
    }
    return {
      next: null,
      motivo: `Apenas exports PRONTO_PARA_DOWNLOAD podem expirar (atual: ${current}).`,
    };
  }

  switch (current) {
    case 'AGUARDANDO_APROVACAO_DPO':
      if (action === 'aprovar_dpo') {
        return { next: 'AGUARDANDO_APROVACAO_SUPERVISOR', motivo: null };
      }
      return {
        next: null,
        motivo:
          'Export aguarda aprovação do DPO. Apenas a action `aprovar_dpo` ou `rejeitar` são permitidas.',
      };

    case 'AGUARDANDO_APROVACAO_SUPERVISOR':
      if (action === 'aprovar_supervisor') {
        return { next: 'APROVADO', motivo: null };
      }
      return {
        next: null,
        motivo:
          'Export aguarda aprovação do supervisor. Apenas `aprovar_supervisor` ou `rejeitar` são permitidas.',
      };

    case 'APROVADO':
      if (action === 'gerar') {
        return { next: 'GERANDO', motivo: null };
      }
      return {
        next: null,
        motivo: 'Export aprovado — somente `gerar` ou `rejeitar` são válidos.',
      };

    case 'GERANDO':
      if (action === 'concluir_geracao') {
        return { next: 'PRONTO_PARA_DOWNLOAD', motivo: null };
      }
      return {
        next: null,
        motivo: 'Export está sendo gerado. Aguarde a conclusão.',
      };

    case 'PRONTO_PARA_DOWNLOAD':
      if (action === 'baixar') {
        return { next: 'BAIXADO', motivo: null };
      }
      return {
        next: null,
        motivo:
          'Export pronto para download. Use `baixar` para registrar o download.',
      };

    case 'BAIXADO':
    case 'EXPIRADO':
    case 'REJEITADO':
      return {
        next: null,
        motivo: `Export está em estado terminal (${current}) — nenhuma transição permitida.`,
      };
  }
}

export interface ExportExpiryCheckArgs {
  status: LgpdExportStatus;
  dataExpiracao: Date | null;
  /** Se omitido, usa `new Date()`. */
  agora?: Date;
}

/**
 * Verifica se um export está expirado. Só faz sentido em
 * `PRONTO_PARA_DOWNLOAD`. Retorna `true` se expirou (caller deve
 * marcar como EXPIRADO e devolver 410 Gone).
 */
export function isExportExpirado(args: ExportExpiryCheckArgs): boolean {
  if (args.status !== 'PRONTO_PARA_DOWNLOAD') {
    return false;
  }
  if (args.dataExpiracao === null) {
    return false;
  }
  const agora = args.agora ?? new Date();
  return args.dataExpiracao.getTime() <= agora.getTime();
}

/**
 * Calcula a data de expiração padrão (7 dias após a geração).
 * RN-LGP-04: arquivo expira em 7 dias após ficar pronto.
 */
export function defaultDataExpiracao(geradoEm: Date = new Date()): Date {
  const d = new Date(geradoEm.getTime());
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}
