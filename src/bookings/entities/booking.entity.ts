import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { Event } from '../../events/entities/event.entity';
import { User } from '../../users/entities/user.entity';
import { BookingItem } from './booking-item.entity';
import { BookingStatus } from './enums/booking-status.enum';
import { TicketStatus } from './enums/ticket-status.enum';

@Entity({ name: 'bookings' })
@Index(['userId', 'status'])
@Index(['eventId', 'status'])
@Check('"total_amount" >= 0')
export class Booking extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @OneToMany(() => BookingItem, (item) => item.booking, {
    cascade: ['insert'],
  })
  items: BookingItem[];

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalAmount: string;

  @Column({
    name: 'cancelled_at',
    type: 'timestamptz',
    nullable: true,
  })
  cancelledAt?: Date;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  expiresAt?: Date;

  @Column({
    name: 'cancellation_reason',
    type: 'text',
    nullable: true,
  })
  cancellationReason?: string;

  // ── Ticket fields (populated on PENDING → CONFIRMED transition) ────────────

  @Index({ unique: true })
  @Column({
    name: 'ticket_number',
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
  })
  ticketNumber?: string;

  @Index({ unique: true })
  @Column({
    name: 'qr_payload',
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  qrPayload?: string;

  @Column({
    name: 'ticket_status',
    type: 'enum',
    enum: TicketStatus,
    nullable: true,
  })
  ticketStatus?: TicketStatus;

  @Column({
    name: 'issued_at',
    type: 'timestamptz',
    nullable: true,
  })
  issuedAt?: Date;

  @Column({
    name: 'checked_in_at',
    type: 'timestamptz',
    nullable: true,
  })
  checkedInAt?: Date;
}
