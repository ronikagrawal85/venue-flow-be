import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Seat } from '../seats/entities/seat.entity';
import { Venue } from '../venue/entities/venue.entity';
import { VenueSection } from '../venue/entities/venue-section.entity';
import { EventSeat } from './entities/event-seat.entity';
import { Event } from './entities/event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventSeat, Venue, Seat, VenueSection]),
    AuditLogsModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
