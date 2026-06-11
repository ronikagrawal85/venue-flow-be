import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RedisClientType } from 'redis';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/entities/audit-log.entity';
import { buildPaginatedResponse } from '../common/dto/paginated-response.helper';
import { SortOrder } from '../common/dto/pagination-query.dto';
import { CACHE_KEYS, CACHE_TTL } from '../common/constants/cache.constants';
import { Seat } from '../seats/entities/seat.entity';
import { JwtUser } from '../auth/interfaces/request-with-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { Venue } from '../venue/entities/venue.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventSeatsQueryDto } from './dto/list-event-seats-query.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventSeatStatus } from './entities/enums/event-seat-status.enum';
import { EventStatus } from './entities/enums/event-status.enum';
import { EventSeat } from './entities/event-seat.entity';
import { Event } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(EventSeat)
    private readonly eventSeatRepository: Repository<EventSeat>,
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,
    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly auditLogsService: AuditLogsService,
    @Inject('REDIS_CLIENT')
    private readonly redisClient: RedisClientType,
  ) { }

  // ─── Cache Helper ─────────────────────────────────────────────────────────

  private async invalidateEventListCache() {
    const keys = await this.redisClient.keys('keyv:events_list_*');
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
    const plainKeys = await this.redisClient.keys('events_list_*');
    if (plainKeys.length > 0) {
      await this.redisClient.del(plainKeys);
    }
  }

  // ─── Ownership helper ──────────────────────────────────────────────────────

  private assertOwnership(event: Event, user: JwtUser): void {
    if (user.role !== UserRole.ADMIN && event.organizerId !== user.id) {
      throw new ForbiddenException(
        'You do not have permission to modify this event',
      );
    }
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async createEvent(dto: CreateEventDto, organizerId: string) {
    const venueExists = await this.venueRepository.existsBy({
      id: dto.venueId,
    });
    if (!venueExists) {
      throw new NotFoundException(`Venue with ID ${dto.venueId} not found`);
    }

    const seats = await this.seatRepository.find({
      relations: { section: true },
      where: { section: { venueId: dto.venueId } },
    });

    if (seats.length === 0) {
      throw new BadRequestException(
        'Cannot create an event for a venue with no seats',
      );
    }

    const event = this.eventRepository.create({
      title: dto.title,
      description: dto.description,
      startTime: new Date(dto.startTime),
      venueId: dto.venueId,
      organizerId,
    });

    const savedEvent = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(event);

      const eventSeats = seats.map((seat) =>
        this.eventSeatRepository.create({
          eventId: saved.id,
          seatId: seat.id,
          price: dto.defaultPrice.toString(),
          status: EventSeatStatus.AVAILABLE,
        }),
      );

      await manager.save(eventSeats);
      return saved;
    });

    await this.invalidateEventListCache();

    return {
      message: 'Event created successfully',
      data: savedEvent,
      generatedSeatsCount: seats.length,
    };
  }

  async logEventCreation(eventId: string, userId: string, title: string) {
    await this.auditLogsService.log({
      action: AuditAction.CREATE,
      entityType: 'Event',
      entityId: eventId,
      userId,
      changes: { title },
    });
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  async listEvents(query: ListEventsQueryDto) {
    const cacheKey = CACHE_KEYS.EVENT_LIST(query);
    const cachedData = await this.cacheManager.get(cacheKey);
    console.log('CACHE VALUE:', cachedData);

    if (cachedData) {
      console.log('CACHE HIT', cacheKey);
      return cachedData;
    }

    console.log('CACHE MISS', cacheKey);

    const {
      page = 1,
      limit = 10,
      search,
      status,
      venueId,
      sortBy = 'startTime',
      sortOrder = SortOrder.ASC,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.venue', 'venue')
      .orderBy(`event.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    if (search) {
      qb.andWhere('event.title ILIKE :search', { search: `%${search}%` });
    }
    if (status) {
      qb.andWhere('event.status = :status', { status });
    }
    if (venueId) {
      qb.andWhere('event.venueId = :venueId', { venueId });
    }

    const [events, total] = await qb.getManyAndCount();

    const result = buildPaginatedResponse(
      'Events retrieved successfully',
      events,
      total,
      page,
      limit,
    );
    await this.cacheManager.set(cacheKey, result, CACHE_TTL.SHORT);
    return result;
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────────

  async getEventById(id: string) {
    const cacheKey = CACHE_KEYS.EVENT_DETAIL(id);
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const event = await this.eventRepository.findOne({
      where: { id },
      relations: {
        venue: true,
        eventSeats: {
          seat: { section: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    const result = {
      message: 'Event retrieved successfully',
      data: event,
    };

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.MEDIUM);
    return result;
  }

  // ─── Get Seats ─────────────────────────────────────────────────────────────

  async getEventSeats(eventId: string, query: ListEventSeatsQueryDto) {
    const eventExists = await this.eventRepository.existsBy({ id: eventId });
    if (!eventExists) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    const { status, row, sortBy = 'row', sortOrder = SortOrder.ASC } = query;

    const qb = this.eventSeatRepository
      .createQueryBuilder('es')
      .leftJoinAndSelect('es.seat', 'seat')
      .leftJoinAndSelect('seat.section', 'section')
      .where('es.eventId = :eventId', { eventId })
      .orderBy(`seat.${sortBy}`, sortOrder);

    if (status) {
      qb.andWhere('es.status = :status', { status });
    }
    if (row) {
      qb.andWhere('seat.row = :row', { row: row.toUpperCase() });
    }

    const eventSeats = await qb.getMany();

    const data = eventSeats.map((es) => ({
      id: es.id,
      row: es.seat.row,
      seatNumber: es.seat.seatNumber,
      price: es.price,
      status: es.status,
      sectionName: es.seat.section?.name,
    }));

    return {
      message: 'Event seats retrieved successfully',
      total: data.length,
      data,
    };
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async updateEvent(id: string, dto: UpdateEventDto, user: JwtUser) {
    const event = await this.eventRepository.findOneBy({ id });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    this.assertOwnership(event, user);

    if (dto.venueId && dto.venueId !== event.venueId) {
      const venueExists = await this.venueRepository.existsBy({
        id: dto.venueId,
      });
      if (!venueExists) {
        throw new NotFoundException(`Venue with ID ${dto.venueId} not found`);
      }
      // TODO (post-MVP): block venue changes when bookings already exist
      event.venueId = dto.venueId;
    }

    if (dto.title !== undefined) event.title = dto.title;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.startTime !== undefined) event.startTime = new Date(dto.startTime);
    if (dto.status !== undefined) event.status = dto.status;

    const updatedEvent = await this.eventRepository.save(event);

    await this.cacheManager.del(CACHE_KEYS.EVENT_DETAIL(id));

    await this.auditLogsService.log({
      action: AuditAction.UPDATE,
      entityType: 'Event',
      entityId: id,
      userId: user.id,
      changes: dto as Record<string, unknown>,
    });

    await this.invalidateEventListCache();

    return {
      message: 'Event updated successfully',
      data: updatedEvent,
    };
  }

  // ─── Publish ───────────────────────────────────────────────────────────────

  async publishEvent(id: string, user: JwtUser) {
    const event = await this.eventRepository.findOneBy({ id });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    this.assertOwnership(event, user);

    if (event.status === EventStatus.PUBLISHED) {
      throw new ConflictException('Event is already published');
    }

    // Ensure the event has at least one seat before going live
    const seatCount = await this.eventSeatRepository.countBy({ eventId: id });
    if (seatCount === 0) {
      throw new BadRequestException(
        'Cannot publish an event with no seats configured',
      );
    }

    event.status = EventStatus.PUBLISHED;
    const published = await this.eventRepository.save(event);

    await this.cacheManager.del(CACHE_KEYS.EVENT_DETAIL(id));

    await this.auditLogsService.log({
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Event',
      entityId: id,
      userId: user.id,
      changes: { from: 'DRAFT', to: 'PUBLISHED' },
    });

    await this.invalidateEventListCache();

    return {
      message: 'Event published successfully',
      data: published,
    };
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteEvent(id: string, user: JwtUser) {
    const event = await this.eventRepository.findOneBy({ id });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    this.assertOwnership(event, user);

    await this.eventRepository.delete(id);

    await this.cacheManager.del(CACHE_KEYS.EVENT_DETAIL(id));

    await this.auditLogsService.log({
      action: AuditAction.DELETE,
      entityType: 'Event',
      entityId: id,
      userId: user.id,
      changes: { title: event.title },
    });

    await this.invalidateEventListCache();

    return {
      message: 'Event deleted successfully',
    };
  }
}
