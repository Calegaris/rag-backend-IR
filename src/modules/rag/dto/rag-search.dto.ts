import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DocType {
  MARCO_TEORICO = 'MARCO_TEORICO',
  LEL = 'LEL',
}

export class RagSearchDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsString()
  @IsOptional()
  @IsIn(['MARCO_TEORICO', 'LEL', 'METODOLOGIA', 'LEL_DOMINIO'])
  type?: DocType | 'MARCO_TEORICO' | 'LEL' | 'METODOLOGIA' | 'LEL_DOMINIO';

  @IsString()
  @IsOptional()
  projectName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  topK?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;
}

