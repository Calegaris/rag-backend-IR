import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RunBenchmarkDto {
  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  rawMarkdown?: string;

  @IsOptional()
  @IsBoolean()
  enableSemantic?: boolean;
}
