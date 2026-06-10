import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EventSeat } from '../events/entities/event-seat.entity';
import { Event } from '../events/entities/event.entity';
import { SeatsModule } from '../seats/seats.module';
import { BookingExpiryService } from './booking-expiry/booking-expiry.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingItem } from './entities/booking-item.entity';
import { Booking } from './entities/booking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      BookingItem,
      EventSeat, // Needed to update seat status inside service transactions
      Event, // Needed to validate event existence and status
    ]),
    SeatsModule, // Provides SeatsGateway for real-time seat-status broadcasting
    AuditLogsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingExpiryService],
  exports: [BookingsService],
})
export class BookingsModule {}
