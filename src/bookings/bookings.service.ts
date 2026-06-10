import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/entities/audit-log.entity';
import { buildPaginatedResponse } from '../common/dto/paginated-response.helper';
import { SortOrder } from '../common/dto/pagination-query.dto';
import { EventSeatStatus } from '../events/entities/enums/event-seat-status.enum';
import { EventStatus } from '../events/entities/enums/event-status.enum';
import { EventSeat } from '../events/entities/event-seat.entity';
import { Event } from '../events/entities/event.entity';
import { SeatsGateway } from '../seats/seats.gateway';
import { UserRole } from '../users/entities/user.entity';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { ListMyBookingsQueryDto } from './dto/list-my-bookings-query.dto';
import { BookingItem } from './entities/booking-item.entity';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './entities/enums/booking-status.enum';
import { TicketStatus } from './entities/enums/ticket-status.enum';

type BookingStatsRaw = {
  totalBookings: string;
  confirmedCount: string;
  cancelledCount: string;
  pendingCount: string;
  expiredCount: string;
  totalSpent: string;
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

    @InjectRepository(BookingItem)
    private readonly bookingItemRepository: Repository<BookingItem>,

    @InjectRepository(EventSeat)
    private readonly eventSeatRepository: Repository<EventSeat>,

    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,

    private readonly dataSource: DataSource,

    private readonly seatsGateway: SeatsGateway,

    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // WRITE OPERATIONS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /bookings
   *
   * Creates a PENDING booking and locks the requested seats.
   * Uses `SELECT … FOR UPDATE SKIP LOCKED` inside a SERIALIZABLE transaction
   * so two concurrent requests for the same seat never both succeed.
   *
   * Seat status flow:  AVAILABLE → LOCKED (here) → BOOKED (on confirm)
   */
  async createBooking(dto: CreateBookingDto, userId: string) {
    const event = await this.eventRepository.findOneBy({ id: dto.eventId });

    if (!event) {
      throw new NotFoundException(`Event ${dto.eventId} not found`);
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        `Bookings are only allowed for PUBLISHED events (current status: ${event.status})`,
      );
    }

    const booking = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const lockedSeats = await manager
          .createQueryBuilder(EventSeat, 'es')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where('es.id IN (:...ids)', { ids: dto.eventSeatIds })
          .andWhere('es.event_id = :eventId', { eventId: dto.eventId })
          .getMany();

        // Every requested seat must be present and lockable.
        if (lockedSeats.length !== dto.eventSeatIds.length) {
          const foundIds = new Set(lockedSeats.map((s) => s.id));
          const missing = dto.eventSeatIds.filter((id) => !foundIds.has(id));
          throw new NotFoundException(
            `Event-seat IDs not found or already locked by another request: ${missing.join(', ')}`,
          );
        }

        // Reject seats that are not AVAILABLE.
        const unavailable = lockedSeats.filter(
          (s) => s.status !== EventSeatStatus.AVAILABLE,
        );
        if (unavailable.length > 0) {
          throw new ConflictException(
            `The following seats are not available: ${unavailable.map((s) => s.id).join(', ')}`,
          );
        }

        // Calculate total from actual seat prices.
        const totalAmount = lockedSeats.reduce(
          (sum, seat) => sum + parseFloat(seat.price),
          0,
        );

        // Persist the booking header.
        const newBooking = manager.create(Booking, {
          userId,
          eventId: dto.eventId,
          status: BookingStatus.PENDING,
          totalAmount: totalAmount.toFixed(2),
          expiresAt: new Date(Date.now() + 1 * 60 * 1000),
        });
        const savedBooking = await manager.save(newBooking);

        // Persist one item per seat, snapshotting price at booking time.
        const items = lockedSeats.map((seat) =>
          manager.create(BookingItem, {
            bookingId: savedBooking.id,
            eventSeatId: seat.id,
            priceAtBooking: seat.price,
          }),
        );
        await manager.save(items);

        // Hold the seats so other users cannot select them.
        await manager.update(
          EventSeat,
          { id: In(lockedSeats.map((s) => s.id)) },
          { status: EventSeatStatus.LOCKED },
        );

        return savedBooking;
      },
    );

    this.logger.log(
      `Booking ${booking.id} created (PENDING) for user ${userId} — ${dto.eventSeatIds.length} seat(s) locked`,
    );

    // ── Audit log ────────────────────────────────────────────────────────────
    await this.auditLogsService.log({
      action: AuditAction.CREATE,
      entityType: 'Booking',
      entityId: booking.id,
      userId,
      changes: {
        eventId: dto.eventId,
        seatCount: dto.eventSeatIds.length,
        status: 'PENDING',
      },
    });

    // ── Real-time: notify all event viewers that these seats are now LOCKED ──
    this.seatsGateway.broadcastSeatUpdate({
      eventId: dto.eventId,
      seats: dto.eventSeatIds.map((id) => ({
        id,
        status: EventSeatStatus.LOCKED,
      })),
    });

    return {
      message: 'Booking created successfully — awaiting confirmation',
      data: await this.findBookingWithDetails(booking.id),
    };
  }

  /**
   * PATCH /bookings/:id/confirm
   *
   * Transitions a PENDING booking to CONFIRMED and permanently marks
   * all its seats as BOOKED.  Only the booking owner or an ADMIN may confirm.
   */
  async confirmBooking(bookingId: string, userId: string, userRole: UserRole) {
    const booking = await this.findBookingOwnedBy(bookingId, userId, userRole);

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING bookings can be confirmed (current: ${booking.status})`,
      );
    }

    const seatIds = booking.items.map((i) => i.eventSeatId);

    await this.dataSource.transaction(async (manager) => {
      // Generate a unique, sequential ticket number via Postgres sequence.
      // This is the only concurrent-safe approach — no application-level races.
      const result: unknown = await manager.query(
        `SELECT nextval('ticket_number_seq') AS seq`,
      );

      if (
        !Array.isArray(result) ||
        result.length === 0 ||
        typeof result[0] !== 'object' ||
        result[0] === null
      ) {
        throw new Error('Failed to generate ticket sequence');
      }

      const row = result[0] as { seq?: string };

      if (!row.seq) {
        throw new Error('Failed to generate ticket sequence');
      }

      const seq = row.seq.padStart(6, '0');

      const year = new Date().getFullYear();
      const ticketNumber = `VF-${year}-${seq}`;
      const qrPayload = `booking:${booking.id}`;

      await manager.update(Booking, booking.id, {
        status: BookingStatus.CONFIRMED,
        ticketNumber,
        qrPayload,
        ticketStatus: TicketStatus.ACTIVE,
        issuedAt: new Date(),
      });

      if (seatIds.length > 0) {
        await manager.update(
          EventSeat,
          { id: In(seatIds) },
          { status: EventSeatStatus.BOOKED },
        );
      }
    });

    this.logger.log(`Booking ${bookingId} confirmed by user ${userId}`);

    // ── Audit log ────────────────────────────────────────────────────────────
    await this.auditLogsService.log({
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Booking',
      entityId: bookingId,
      userId,
      changes: { from: 'PENDING', to: 'CONFIRMED' },
    });

    // ── Real-time: notify all event viewers that these seats are now BOOKED ──
    if (seatIds.length > 0) {
      this.seatsGateway.broadcastSeatUpdate({
        eventId: booking.eventId,
        seats: seatIds.map((id) => ({ id, status: EventSeatStatus.BOOKED })),
      });
    }

    return {
      message: 'Booking confirmed successfully',
      data: await this.findBookingWithDetails(bookingId),
    };
  }

  /**
   * DELETE /bookings/:id
   *
   * Cancels a PENDING or CONFIRMED booking and releases seats back to AVAILABLE.
   * - Owners may cancel their own bookings in any non-cancelled state.
   * - Admins may cancel any booking.
   */
  async cancelBooking(
    bookingId: string,
    dto: CancelBookingDto,
    userId: string,
    userRole: UserRole,
  ) {
    const booking = await this.findBookingOwnedBy(bookingId, userId, userRole);

    if (
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.EXPIRED
    ) {
      throw new BadRequestException(`Cannot cancel ${booking.status} booking`);
    }

    const cancelledSeatIds = booking.items.map((i) => i.eventSeatId);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Booking, booking.id, {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? undefined,
      });

      // Release seats regardless of whether they were LOCKED or BOOKED.
      if (cancelledSeatIds.length > 0) {
        await manager.update(
          EventSeat,
          { id: In(cancelledSeatIds) },
          { status: EventSeatStatus.AVAILABLE },
        );
      }
    });

    this.logger.log(
      `Booking ${bookingId} cancelled by user ${userId} (role: ${userRole}). Reason: ${dto.reason ?? 'N/A'}`,
    );

    // ── Audit log ────────────────────────────────────────────────────────────
    await this.auditLogsService.log({
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Booking',
      entityId: bookingId,
      userId,
      changes: {
        from: booking.status,
        to: 'CANCELLED',
        reason: dto.reason ?? null,
      },
    });

    // ── Real-time: notify all event viewers that these seats are AVAILABLE again ──
    if (cancelledSeatIds.length > 0) {
      this.seatsGateway.broadcastSeatUpdate({
        eventId: booking.eventId,
        seats: cancelledSeatIds.map((id) => ({
          id,
          status: EventSeatStatus.AVAILABLE,
        })),
      });
    }

    return {
      message: 'Booking cancelled successfully',
      data: await this.findBookingWithDetails(bookingId),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // READ OPERATIONS
  // ────────────────────────────────────────────────────────────────────────────

  /** Return the authenticated user's own bookings with optional status filter and pagination. */
  async getMyBookings(userId: string, query: ListMyBookingsQueryDto) {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = SortOrder.DESC,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.event', 'event')
      .leftJoinAndSelect('event.venue', 'venue')
      .leftJoinAndSelect('booking.items', 'items')
      .leftJoinAndSelect('items.eventSeat', 'eventSeat')
      .leftJoinAndSelect('eventSeat.seat', 'seat')
      .leftJoinAndSelect('seat.section', 'section')
      .where('booking.userId = :userId', { userId })
      .orderBy(`booking.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('booking.status = :status', { status });
    }

    const [bookings, total] = await qb.getManyAndCount();

    return buildPaginatedResponse(
      'Bookings retrieved successfully',
      bookings,
      total,
      page,
      limit,
    );
  }

  async getBookingById(bookingId: string, userId: string, userRole: UserRole) {
    const booking = await this.findBookingOwnedBy(bookingId, userId, userRole);
    return {
      message: 'Booking retrieved successfully',
      data: booking,
    };
  }

  async adminListBookings(query: ListBookingsQueryDto) {
    const {
      page = 1,
      limit = 10,
      status,
      eventId,
      userId,
      sortBy = 'createdAt',
      sortOrder = SortOrder.DESC,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.event', 'event')
      .leftJoinAndSelect('event.venue', 'venue')
      .leftJoinAndSelect('booking.user', 'user')
      .leftJoinAndSelect('booking.items', 'items')
      .leftJoinAndSelect('items.eventSeat', 'eventSeat')
      .leftJoinAndSelect('eventSeat.seat', 'seat')
      .leftJoinAndSelect('seat.section', 'section')
      .orderBy(`booking.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    if (status) {
      qb.andWhere('booking.status = :status', { status });
    }
    if (eventId) {
      qb.andWhere('booking.eventId = :eventId', { eventId });
    }
    if (userId) {
      qb.andWhere('booking.userId = :userId', { userId });
    }

    const [bookings, total] = await qb.getManyAndCount();

    return buildPaginatedResponse(
      'All bookings retrieved successfully',
      bookings,
      total,
      page,
      limit,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BOOKING STATS
  // ────────────────────────────────────────────────────────────────────────────

  async getMyBookingStats(userId: string) {
    const stats = await this.bookingRepository
      .createQueryBuilder('booking')
      .select('COUNT(*)', 'totalBookings')
      .addSelect(
        `COUNT(*) FILTER (WHERE booking.status = 'CONFIRMED')`,
        'confirmedCount',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE booking.status = 'CANCELLED')`,
        'cancelledCount',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE booking.status = 'PENDING')`,
        'pendingCount',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE booking.status = 'EXPIRED')`,
        'expiredCount',
      )
      .addSelect(
        `COALESCE(SUM(booking.total_amount) FILTER (WHERE booking.status = 'CONFIRMED'), 0)`,
        'totalSpent',
      )
      .where('booking.userId = :userId', { userId })
      .getRawOne<BookingStatsRaw>();

    // Count upcoming events (confirmed bookings for future events)
    const upcomingCount = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoin('booking.event', 'event')
      .where('booking.userId = :userId', { userId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('event.start_time > NOW()')
      .getCount();

    if (!stats) {
      throw new NotFoundException('Booking stats not found');
    }

    return {
      message: 'Booking stats retrieved successfully',
      data: {
        totalBookings: parseInt(stats.totalBookings, 10),
        confirmedCount: parseInt(stats.confirmedCount, 10),
        cancelledCount: parseInt(stats.cancelledCount, 10),
        pendingCount: parseInt(stats.pendingCount, 10),
        expiredCount: parseInt(stats.expiredCount, 10),
        totalSpent: parseFloat(stats.totalSpent),
        upcomingEvents: upcomingCount,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  private async findBookingWithDetails(bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: {
        event: { venue: true },
        user: true,
        items: { eventSeat: { seat: { section: true } } },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    return booking;
  }

  /**
   * Loads a booking and asserts ownership.
   * Admins bypass the ownership check.
   */
  private async findBookingOwnedBy(
    bookingId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: {
        event: { venue: true },
        user: true,
        items: { eventSeat: { seat: { section: true } } },
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    if (userRole !== UserRole.ADMIN && booking.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this booking',
      );
    }

    return booking;
  }
}
