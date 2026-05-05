/**
 * `FhirSerializer` — gera um Bundle FHIR R4 SIMPLIFICADO a partir do
 * estado atual de um paciente no HMS-BR.
 *
 * **STUB Phase 13 R-A**: monta apenas Patient + Encounter + Observation
 * (sinais vitais) + Condition (CIDs do atendimento). Para a versão
 * production-grade (Composition para laudos, MedicationRequest para
 * prescrições, AllergyIntolerance, Coverage, DocumentReference, ...),
 * abrir issue Phase 13+.
 *
 * Premissa de RLS: usa `prisma.tx()` — o tenant já está aplicado pelo
 * `TenantContextInterceptor`.
 *
 * Saída: objeto JSON serializável; o caller calcula SHA-256 e simula
 * upload em `memory://lgpd-exports/<uuid>`.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/persistence/prisma.service';

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'collection';
  id: string;
  meta: {
    lastUpdated: string;
    source: 'HMS-BR';
    profile: string[];
  };
  entry: Array<{ resource: Record<string, unknown> }>;
}

interface PacienteRow {
  id: bigint;
  uuid_externo: string;
  codigo: string;
  nome: string;
  nome_social: string | null;
  data_nascimento: Date;
  sexo: string;
  cns: string | null;
  obito: boolean;
  data_obito: Date | null;
}

interface EncounterRow {
  uuid_externo: string;
  data_inicio: Date;
  data_fim: Date | null;
  tipo: string;
  status: string;
  cid_principal: string | null;
}

interface ObservationRow {
  uuid_externo: string;
  atendimento_uuid: string | null;
  pa_sistolica: number | null;
  pa_diastolica: number | null;
  fc: number | null;
  fr: number | null;
  temperatura: string | null;
  saturacao: number | null;
  glicemia: number | null;
  registrado_em: Date;
}

@Injectable()
export class FhirSerializer {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Monta o Bundle FHIR de um paciente. Retorna `null` se o paciente
   * não existir / estiver soft-deleted.
   */
  async buildBundleForPaciente(
    pacienteId: bigint,
  ): Promise<FhirBundle | null> {
    const tx = this.prisma.tx();

    const pacienteRows = await tx.$queryRaw<PacienteRow[]>`
      SELECT id, uuid_externo::text AS uuid_externo, codigo,
             nome, nome_social, data_nascimento, sexo, cns,
             obito, data_obito
        FROM pacientes
       WHERE id = ${pacienteId}::bigint
         AND deleted_at IS NULL
       LIMIT 1
    `;
    if (pacienteRows.length === 0) {
      return null;
    }
    const paciente = pacienteRows[0];

    const encounters = await this.fetchEncounters(pacienteId).catch(() => []);
    const observations = await this.fetchObservations(pacienteId).catch(
      () => [],
    );

    const lastUpdated = new Date().toISOString();
    const patientReference = `Patient/${paciente.uuid_externo}`;

    const bundle: FhirBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      id: `lgpd-export-${paciente.uuid_externo}`,
      meta: {
        lastUpdated,
        source: 'HMS-BR',
        profile: ['http://hl7.org/fhir/R4/bundle.html'],
      },
      entry: [],
    };

    // 1. Patient
    bundle.entry.push({
      resource: {
        resourceType: 'Patient',
        id: paciente.uuid_externo,
        identifier: [
          {
            system: 'urn:hms-br:codigo',
            value: paciente.codigo,
          },
          ...(paciente.cns !== null
            ? [
                {
                  system: 'http://www.saude.gov.br/fhir/r4/NamingSystem/cns',
                  value: paciente.cns,
                },
              ]
            : []),
        ],
        name: [
          {
            use: 'official',
            text: paciente.nome,
            ...(paciente.nome_social !== null
              ? { suffix: [paciente.nome_social] }
              : {}),
          },
        ],
        gender: this.mapSexoToFhirGender(paciente.sexo),
        birthDate: paciente.data_nascimento.toISOString().slice(0, 10),
        deceasedBoolean: paciente.obito,
        ...(paciente.data_obito !== null
          ? { deceasedDateTime: paciente.data_obito.toISOString() }
          : {}),
      },
    });

    // 2. Encounter + Condition (1 condition por CID principal não-nulo)
    for (const enc of encounters) {
      bundle.entry.push({
        resource: {
          resourceType: 'Encounter',
          id: enc.uuid_externo,
          status: this.mapEncounterStatus(enc.status),
          class: { code: enc.tipo, display: enc.tipo },
          subject: { reference: patientReference },
          period: {
            start: enc.data_inicio.toISOString(),
            ...(enc.data_fim !== null
              ? { end: enc.data_fim.toISOString() }
              : {}),
          },
        },
      });

      if (enc.cid_principal !== null) {
        bundle.entry.push({
          resource: {
            resourceType: 'Condition',
            id: `${enc.uuid_externo}-cid`,
            subject: { reference: patientReference },
            encounter: { reference: `Encounter/${enc.uuid_externo}` },
            code: {
              coding: [
                {
                  system: 'http://hl7.org/fhir/sid/icd-10',
                  code: enc.cid_principal,
                },
              ],
            },
          },
        });
      }
    }

    // 3. Observation (sinais vitais — uma Observation por linha agregada)
    for (const obs of observations) {
      const components: Array<Record<string, unknown>> = [];
      if (obs.pa_sistolica !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '8480-6' }],
          },
          valueQuantity: { value: obs.pa_sistolica, unit: 'mmHg' },
        });
      }
      if (obs.pa_diastolica !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '8462-4' }],
          },
          valueQuantity: { value: obs.pa_diastolica, unit: 'mmHg' },
        });
      }
      if (obs.fc !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '8867-4' }],
          },
          valueQuantity: { value: obs.fc, unit: '/min' },
        });
      }
      if (obs.fr !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '9279-1' }],
          },
          valueQuantity: { value: obs.fr, unit: '/min' },
        });
      }
      if (obs.temperatura !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '8310-5' }],
          },
          valueQuantity: { value: Number(obs.temperatura), unit: 'Cel' },
        });
      }
      if (obs.saturacao !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '59408-5' }],
          },
          valueQuantity: { value: obs.saturacao, unit: '%' },
        });
      }
      if (obs.glicemia !== null) {
        components.push({
          code: {
            coding: [{ system: 'http://loinc.org', code: '2339-0' }],
          },
          valueQuantity: { value: obs.glicemia, unit: 'mg/dL' },
        });
      }

      bundle.entry.push({
        resource: {
          resourceType: 'Observation',
          id: obs.uuid_externo,
          status: 'final',
          category: [
            {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'vital-signs',
                  display: 'Vital Signs',
                },
              ],
            },
          ],
          code: {
            text: 'Sinais vitais (HMS-BR)',
          },
          subject: { reference: patientReference },
          ...(obs.atendimento_uuid !== null
            ? { encounter: { reference: `Encounter/${obs.atendimento_uuid}` } }
            : {}),
          effectiveDateTime: obs.registrado_em.toISOString(),
          component: components,
        },
      });
    }

    return bundle;
  }

  // ─────────── Helpers ───────────

  private async fetchEncounters(pacienteId: bigint): Promise<EncounterRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<EncounterRow[]>`
      SELECT a.uuid_externo::text AS uuid_externo,
             a.data_inicio,
             a.data_fim,
             a.tipo::text         AS tipo,
             a.status::text       AS status,
             a.cid_principal
        FROM atendimentos a
       WHERE a.paciente_id = ${pacienteId}::bigint
         AND a.deleted_at IS NULL
       ORDER BY a.data_inicio DESC
       LIMIT 200
    `;
  }

  private async fetchObservations(
    pacienteId: bigint,
  ): Promise<ObservationRow[]> {
    const tx = this.prisma.tx();
    return tx.$queryRaw<ObservationRow[]>`
      SELECT sv.uuid_externo::text AS uuid_externo,
             a.uuid_externo::text  AS atendimento_uuid,
             sv.pa_sistolica,
             sv.pa_diastolica,
             sv.fc,
             sv.fr,
             sv.temperatura::text  AS temperatura,
             sv.saturacao,
             sv.glicemia,
             sv.registrado_em
        FROM sinais_vitais sv
        LEFT JOIN atendimentos a ON a.id = sv.atendimento_id
       WHERE sv.paciente_id = ${pacienteId}::bigint
       ORDER BY sv.registrado_em DESC
       LIMIT 500
    `;
  }

  private mapSexoToFhirGender(sexo: string): string {
    switch (sexo.toUpperCase()) {
      case 'M':
      case 'MASCULINO':
        return 'male';
      case 'F':
      case 'FEMININO':
        return 'female';
      default:
        return 'unknown';
    }
  }

  private mapEncounterStatus(status: string): string {
    // Mapeamento conservador. Em Phase 13+ refinar contra ValueSet
    // http://hl7.org/fhir/R4/valueset-encounter-status.html
    switch (status.toUpperCase()) {
      case 'EM_ANDAMENTO':
      case 'EM_ATENDIMENTO':
        return 'in-progress';
      case 'AGUARDANDO':
      case 'CHECK_IN':
        return 'arrived';
      case 'FINALIZADO':
      case 'ENCERRADO':
      case 'ALTA':
        return 'finished';
      case 'CANCELADO':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }
}
