import { IsNotEmpty, IsString } from 'class-validator';

export class ParseScenarioDto {
  @IsString({ message: 'rawMarkdown debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'rawMarkdown no puede estar vacío' })
  rawMarkdown: string;
}
