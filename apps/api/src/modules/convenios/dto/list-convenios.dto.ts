/**
 * Query DTO para `GET /v1/convenios`.
 */
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListConveniosQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(['CONVENIO', 'SUS', 'PARTICULAR'])
  tipo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ativo?: boolean;
}
