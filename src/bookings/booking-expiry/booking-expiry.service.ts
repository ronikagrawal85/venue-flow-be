import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { EventSeatStatus } from 'src/events/entities/enums/event-seat-status.enum';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { EventSeat } from '../../events/entities/event-seat.entity';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../entities/enums/booking-status.enum';

@Injectable()
export class BookingExpiryService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly dataSource: DataSource,
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

    for (const booking of expiredBookings) {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(Booking, booking.id, {
          status: BookingStatus.EXPIRED,
        });

        const seatIds = booking.items.map((item) => item.eventSeatId);

        await manager.update(
          EventSeat,
          {
            id: In(seatIds),
          },
          {
            status: EventSeatStatus.AVAILABLE,
          },
        );
      });
    }
  }
}
