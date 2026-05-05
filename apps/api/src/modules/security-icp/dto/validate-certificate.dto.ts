/**
 * `POST /v1/security/icp-brasil/validar` — DTO de entrada.
 */
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsISO8601,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class CertDataDto {
  @IsString()
  @Length(1, 500)
  issuer!: string;

  @IsISO8601()
  validFrom!: string;

  @IsISO8601()
  validTo!: string;

  @IsString()
  @Length(1, 200)
  serialNumber!: string;
}

export class ValidateCertificateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CertDataDto)
  certData!: CertDataDto;
}
