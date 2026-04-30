/**
 * Use case: `POST /v1/pacientes/buscar` — busca avançada por
 * CPF / CNS / código / nome. Pelo menos UM dos campos é obrigatório.
 *
 * Diferenças vs. `list`:
 *   - CPF: hash determinístico → lookup O(log n) (`uq_pacientes_cpf_tenant`).
 *   - CNS: lookup direto.
 *   - Código: lookup direto.
 *   - Nome: trigram com threshold default — devolve **lista**, não item único.
 *
 * Retorna sempre um array (mesmo CPF/CNS retornam array com 0..1 itens) —
 * UI consistente.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { PacientesRepository } from '../infrastructure/pacientes.repository';
import { CpfCryptoService } from '../infrastructure/cpf-crypto.service';
import { CpfValidator } from '../infrastructure/cpf.validator';
import { CnsValidator } from '../infrastructure/cns.validator';
import type { SearchPacienteDto } from '../dto/search-paciente.dto';
import type { PacienteResponse } from '../dto/paciente.response';
import { presentPaciente } from './paciente.presenter';

@Injectable()
export class SearchPacienteUseCase {
  constructor(
    private readonly repo: PacientesRepository,
    private readonly cpfCrypto: CpfCryptoService,
  ) {}

  async execute(dto: SearchPacienteDto): Promise<{ data: PacienteResponse[] }> {
    const filled = [dto.cpf, dto.cns, dto.codigo, dto.nome].filter(
      (v) => v !== undefined && v.length > 0,
    );
    if (filled.length === 0) {
      throw new BadRequestException({
        code: 'SEARCH_REQUIRES_AT_LEAST_ONE_FIELD',
        message:
          'Informe ao menos um critério: cpf, cns, codigo ou nome.',
      });
    }

    if (dto.cpf !== undefined && dto.cpf.length > 0) {
      if (!CpfValidator.isValid(dto.cpf)) {
        // Não emite erro — devolve vazio para não vazar info de "CPF
        // existe/não existe" para inputs malformados.
        return { data: [] };
      }
      const hash = this.cpfCrypto.hashCpf(dto.cpf);
      const row = await this.repo.findByCpfHash(hash);
      return { data: row === null ? [] : [presentPaciente(row)] };
    }

    if (dto.cns !== undefined && dto.cns.length > 0) {
      const normalized = CnsValidator.normalize(dto.cns) ?? dto.cns;
      const row = await this.repo.findByCns(normalized);
      return { data: row === null ? [] : [presentPaciente(row)] };
    }

    if (dto.codigo !== undefined && dto.codigo.length > 0) {
      const row = await this.repo.findByCodigo(dto.codigo);
      return { data: row === null ? [] : [presentPaciente(row)] };
    }

    // Nome: trigram (limite 20).
    const { data } = await this.repo.list({
      page: 1,
      pageSize: 20,
      q: dto.nome,
    });
    return { data: data.map((row) => presentPaciente(row)) };
  }
}
