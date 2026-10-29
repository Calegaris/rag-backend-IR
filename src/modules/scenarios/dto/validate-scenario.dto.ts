import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidateScenarioDto {
  @IsString({ message: 'rawMarkdown debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'rawMarkdown no puede estar vacío' })
  rawMarkdown: string;

  @IsOptional()
  @IsBoolean({ message: 'enableSemantic debe ser un valor booleano' })
  enableSemantic?: boolean;

  @IsOptional()
  @IsString({ message: 'projectName debe ser una cadena de texto' })
  projectName?: string;
}
