import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IngestLelDto {
  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  lelMarkdown: string;
}

