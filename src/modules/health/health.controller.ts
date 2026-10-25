import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health.indicators';

/**
 * /health: liveness. Answers as long as the process is up; used by the container health check.
 * /ready:  readiness. Also checks Postgres and Redis; used by the load balancer.
 * Both are unversioned (excluded from the /v1 prefix).
 */
@ApiTags('ops')
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (Postgres and Redis)' })
  readiness() {
    return this.health.check([
      () => this.database.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
