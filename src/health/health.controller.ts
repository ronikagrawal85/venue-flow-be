import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('Health')
@Controller({ path: 'health', version: '' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Application health check (DB, memory, disk)',
  })
  check() {
    return this.health.check([
      // ── Database ────────────────────────────────────────────────────────────
      () => this.db.pingCheck('database'),

      // ── Memory — fail if heap exceeds 256 MB ────────────────────────────────
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),

      // ── Disk — fail if >90% used on root partition ──────────────────────────
      () =>
        this.disk.checkStorage('disk', {
          thresholdPercent: 0.9,
          path: '/',
        }),
    ]);
  }
}
