import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { EventSeat } from '../../events/entities/event-seat.entity';
import { Booking } from './booking.entity';

@Entity({ name: 'booking_items' })
@Index(['bookingId'])
@Check('"price_at_booking" >= 0')
export class BookingItem extends BaseEntity {
  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @ManyToOne(() => Booking, (booking) => booking.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ name: 'event_seat_id', type: 'uuid' })
  eventSeatId: string;

  @ManyToOne(() => EventSeat, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'event_seat_id' })
  eventSeat: EventSeat;

  @Column({
    name: 'price_at_booking',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  priceAtBooking: string;
}
