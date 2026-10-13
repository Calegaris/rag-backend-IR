import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService, HealthCheckResult } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(@Res() res: Response): Promise<Response<HealthCheckResult>> {
    const result = await this.healthService.check();
    const statusCode = result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json(result);
  }
}
