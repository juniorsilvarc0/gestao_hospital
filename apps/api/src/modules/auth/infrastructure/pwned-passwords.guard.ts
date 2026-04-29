/**
 * PwnedPasswordsService — RN-SEG-01.
 *
 * Não chamamos a API HaveIBeenPwned (latência + dependência externa
 * em endpoint de troca de senha). Em vez disso carregamos uma lista
 * curada (`data/top-10000.txt`) na boot e checamos em memória.
 *
 * Em produção a lista pode ser substituída/ampliada sem código:
 * basta trocar o arquivo (re-deploy).
 *
 * Performance: HashSet (`Set<string>`) — O(1) lookup. ~10k entries
 * ≈ poucos MB de RAM.
 *
 * `validate()` aplica também as outras validações de senha:
 *   - tamanho mínimo (12) e máximo (256)  — RN-SEG-01
 *   - não conter email ou nome do usuário (case-insensitive)
 *
 * Retorna primeira falha (formato simples para apresentar erro único
 * ao usuário). Para múltiplas falhas em batch, ver tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { WeakPasswordError } from '../domain/auth.errors';

const MIN_LENGTH = 12;
const MAX_LENGTH = 256;

export interface PasswordPolicyContext {
  email?: string;
  nome?: string;
}

@Injectable()
export class PwnedPasswordsService {
  private readonly logger = new Logger(PwnedPasswordsService.name);
  private readonly dictionary: Set<string>;

  constructor() {
    this.dictionary = this.loadDictionary();
    this.logger.log(
      `Pwned-password dictionary loaded (${this.dictionary.size.toString()} entries)`,
    );
  }

  /**
   * Lança `WeakPasswordError` na primeira falha; retorna `void` em
   * sucesso. Mensagens em PT-BR (vão para o usuário final).
   */
  validate(password: string, context: PasswordPolicyContext = {}): void {
    if (typeof password !== 'string' || password.length === 0) {
      throw new WeakPasswordError('Senha não pode ser vazia.');
    }
    if (password.length < MIN_LENGTH) {
      throw new WeakPasswordError(
        `A senha deve ter no mínimo ${MIN_LENGTH.toString()} caracteres.`,
      );
    }
    if (password.length > MAX_LENGTH) {
      throw new WeakPasswordError(
        `A senha pode ter no máximo ${MAX_LENGTH.toString()} caracteres.`,
      );
    }

    const lowered = password.toLowerCase();

    if (context.email !== undefined && context.email.length > 0) {
      const emailLocal = context.email.split('@')[0]?.toLowerCase();
      if (
        lowered.includes(context.email.toLowerCase()) ||
        (emailLocal !== undefined &&
          emailLocal.length >= 4 &&
          lowered.includes(emailLocal))
      ) {
        throw new WeakPasswordError(
          'A senha não pode conter o seu email.',
        );
      }
    }

    if (context.nome !== undefined && context.nome.length > 0) {
      // Quebra o nome em palavras de >=4 caracteres para checar
      // "joao silva" também rejeita "joao12345678" (mas aceita "ana123…"
      // se o sobrenome não for trivial).
      const tokens = context.nome
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 4);
      for (const token of tokens) {
        if (lowered.includes(token)) {
          throw new WeakPasswordError(
            'A senha não pode conter partes do seu nome.',
          );
        }
      }
    }

    if (this.dictionary.has(password) || this.dictionary.has(lowered)) {
      throw new WeakPasswordError(
        'Esta senha está em listas de senhas vazadas. Escolha outra.',
      );
    }
  }

  /** Diagnóstico para testes — não usar em produção. */
  isCommon(password: string): boolean {
    return (
      this.dictionary.has(password) ||
      this.dictionary.has(password.toLowerCase())
    );
  }

  size(): number {
    return this.dictionary.size;
  }

  private loadDictionary(): Set<string> {
    const candidates = [
      // Diretório original (src/.../data/top-10000.txt — dev/test).
      join(__dirname, '..', 'data', 'top-10000.txt'),
      // Em produção (após `nest build`), o asset precisa estar copiado
      // ao lado do JS. nest-cli.json `compilerOptions.assets` cuida disso.
      join(__dirname, 'data', 'top-10000.txt'),
    ];

    for (const candidate of candidates) {
      try {
        const raw = readFileSync(candidate, 'utf8');
        const lines = raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        return new Set<string>(lines);
      } catch {
        continue;
      }
    }

    // Fallback: lista mínima embutida (não falhamos se o asset não
    // estiver presente — apenas degradamos a proteção). Em produção,
    // logger.warn ajuda o operador a perceber.
    this.logger.warn(
      'Pwned-password dictionary file not found — using minimal fallback list',
    );
    return new Set<string>([
      '123456',
      'password',
      'qwerty',
      '12345678',
      'admin',
      'letmein',
      'welcome',
      'changeme',
      'p@ssw0rd',
      'iloveyou',
    ]);
  }
}
