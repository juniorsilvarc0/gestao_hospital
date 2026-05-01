/**
 * DTOs das fichas cirúrgica e anestésica (RN-CC-04).
 *
 * O conteúdo é JSONB livre — a normalização (TipTap doc, fields padrão
 * por hospital) fica na UI/IA. Aqui só garantimos `Record<string,
 * unknown>` não-vazio.
 */
import { IsObject } from 'class-validator';

export class FichaCirurgicaDto {
  @IsObject()
  ficha!: Record<string, unknown>;
}

export class FichaAnestesicaDto {
  @IsObject()
  ficha!: Record<string, unknown>;
}
