import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginatedResponse } from '../common/dto/paginated-response.helper';
import { AuditAction, AuditLog } from './entities/audit-log.entity';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface AuditLogInput {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /**
   * Fire-and-forget audit log persistence.
   * Failures are logged but never propagate to the caller.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      const entry = this.auditLogRepo.create(input);
      await this.auditLogRepo.save(entry);
    } catch (err) {
      this.logger.error('Failed to persist audit log', err);
    }
  }

  async findAll(query: QueryAuditLogsDto) {
    const {
      page = 1,
      limit = 20,
      action,
      entityType,
      userId,
      dateFrom,
      dateTo,
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.auditLogRepo
      .createQueryBuilder('log')
      .orderBy('log.created_at', sortOrder)
      .skip(skip)
      .take(limit);

    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (entityType) {
      qb.andWhere('log.entity_type = :entityType', { entityType });
    }
    if (userId) {
      qb.andWhere('log.user_id = :userId', { userId });
    }
    if (dateFrom) {
      qb.andWhere('log.created_at >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }
    if (dateTo) {
      qb.andWhere('log.created_at <= :dateTo', {
        dateTo: new Date(dateTo + 'T23:59:59.999Z'),
      });
    }

    const [logs, total] = await qb.getManyAndCount();

    return buildPaginatedResponse(
      'Audit logs retrieved successfully',
      logs,
      total,
      page,
      limit,
    );
  }

  async findById(id: string): Promise<AuditLog | null> {
    return this.auditLogRepo.findOne({ where: { id } });
  }
}
