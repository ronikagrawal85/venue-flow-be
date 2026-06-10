import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Seat } from '../seats/entities/seat.entity';
import { VenueSection } from './entities/venue-section.entity';
import { Venue } from './entities/venue.entity';
import { VenueController } from './venue.controller';
import { VenueService } from './venue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Venue, VenueSection, Seat]),
    AuditLogsModule,
  ],
  controllers: [VenueController],
  providers: [VenueService],
  exports: [VenueService],
})
export class VenueModule {}
