import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/permission.guard';

@Controller('health')
export class HealthController {
  /** Liveness probe for Docker healthcheck; reveals no version or internal details. */
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
