import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ScenariosService } from './scenarios.service';
import { ParseScenarioDto } from './dto/parse-scenario.dto';
import { ValidateScenarioDto } from './dto/validate-scenario.dto';
import { ScenarioStructure } from './parser/parser.types';
import { ValidationReport } from './validator/validator.types';

@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Post('parse')
  @HttpCode(HttpStatus.OK)
  parse(@Body() dto: ParseScenarioDto): ScenarioStructure {
    return this.scenariosService.parse(dto);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@Body() dto: ValidateScenarioDto): ValidationReport {
    return this.scenariosService.validate(dto);
  }
}
