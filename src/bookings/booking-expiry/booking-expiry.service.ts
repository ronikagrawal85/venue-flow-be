import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EventSeatStatus } from 'src/events/entities/enums/event-seat-status.enum';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { EventSeat } from '../../events/entities/event-seat.entity';
import { SeatsGateway } from '../../seats/seats.gateway';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../entities/enums/booking-status.enum';

@Injectable()
export class BookingExpiryService {
  private readonly logger = new Logger(BookingExpiryService.name);
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly dataSource: DataSource,
    private readonly seatsGateway: SeatsGateway,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingBookings() {
    const expiredBookings = await this.bookingRepository.find({
      where: {
        status: BookingStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      relations: {
        items: true,
      },
    });

    if (expiredBookings.length === 0) return;

    this.logger.log(`Expiring ${expiredBookings.length} pending booking(s)…`);

    for (const booking of expiredBookings) {
      const seatIds = booking.items.map((item) => item.eventSeatId);

      await this.dataSource.transaction(async (manager) => {
        await manager.update(Booking, booking.id, {
          status: BookingStatus.EXPIRED,
        });

        if (seatIds.length > 0) {
          await manager.update(
            EventSeat,
            { id: In(seatIds) },
            { status: EventSeatStatus.AVAILABLE },
          );
        }
      });

      this.logger.log(
        `Booking ${booking.id} expired — ${seatIds.length} seat(s) released back to AVAILABLE`,
      );

      // ── Real-time: notify all viewers of this event that seats are freed ──
      if (seatIds.length > 0) {
        this.seatsGateway.broadcastSeatUpdate({
          eventId: booking.eventId,
          seats: seatIds.map((id) => ({
            id,
            status: EventSeatStatus.AVAILABLE,
          })),
        });
      }
    }
  }
}
