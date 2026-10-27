import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ScenariosService } from './scenarios.service';
import { ParseScenarioDto } from './dto/parse-scenario.dto';
import { ValidateScenarioDto } from './dto/validate-scenario.dto';
import {
  ExtractScenariosDto,
  ExtractScenariosResponse,
} from './dto/extract-scenarios.dto';
import {
  StructureScenarioDto,
  StructureScenarioResponse,
} from './dto/structure-scenario.dto';
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

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  async extract(
    @Body() dto: ExtractScenariosDto,
    @Headers('x-llm-api-key') apiKeyOverride?: string,
    @Headers('x-llm-provider') providerOverride?: string,
    @Headers('x-llm-model') modelOverride?: string,
  ): Promise<ExtractScenariosResponse> {
    return this.scenariosService.extract(dto, {
      apiKeyOverride,
      providerOverride,
      modelOverride,
    });
  }

  @Post('structure')
  @HttpCode(HttpStatus.OK)
  async structure(
    @Body() dto: StructureScenarioDto,
    @Headers('x-llm-api-key') apiKeyOverride?: string,
    @Headers('x-llm-provider') providerOverride?: string,
    @Headers('x-llm-model') modelOverride?: string,
  ): Promise<StructureScenarioResponse> {
    return this.scenariosService.structure(dto, {
      apiKeyOverride,
      providerOverride,
      modelOverride,
    });
  }
}
