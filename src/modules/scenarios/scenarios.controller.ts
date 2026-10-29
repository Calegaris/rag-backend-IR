import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ExtractScenariosDto,
  ExtractScenariosResponse,
} from './dto/extract-scenarios.dto';
import { ParseScenarioDto } from './dto/parse-scenario.dto';
import {
  StructureScenarioDto,
  StructureScenarioResponse,
} from './dto/structure-scenario.dto';
import { ValidateScenarioDto } from './dto/validate-scenario.dto';
import { ScenarioStructure } from './parser/parser.types';
import { ScenariosService } from './scenarios.service';
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
  async validate(
    @Body() dto: ValidateScenarioDto,
    @Headers('x-llm-api-key') apiKeyOverride?: string,
    @Headers('x-llm-provider') providerOverride?: string,
    @Headers('x-llm-model') modelOverride?: string,
  ): Promise<ValidationReport> {
    return this.scenariosService.validate(dto, {
      apiKeyOverride,
      providerOverride,
      modelOverride,
    });
  }

  @Get('validations')
  @HttpCode(HttpStatus.OK)
  async getValidations(@Query('limit') limit?: string) {
    const parsedLimit = limit !== undefined ? Number(limit) : undefined;
    return this.scenariosService.getValidations(
      parsedLimit && !Number.isNaN(parsedLimit) ? parsedLimit : undefined,
    );
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
