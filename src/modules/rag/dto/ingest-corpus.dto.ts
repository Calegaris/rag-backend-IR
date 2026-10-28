import { IsOptional, IsString } from 'class-validator';

export class IngestCorpusDto {
  @IsString()
  @IsOptional()
  projectName?: string;
}

