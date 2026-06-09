import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as puppeteer from 'puppeteer';
import * as QRCode from 'qrcode';
import { DataSource, Repository } from 'typeorm';
import { BookingItem } from '../bookings/entities/booking-item.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../bookings/entities/enums/booking-status.enum';
import { TicketStatus } from '../bookings/entities/enums/ticket-status.enum';
import { UserRole } from '../users/entities/user.entity';
import { VerifyTicketDto } from './dto/verify-ticket.dto';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,

    @InjectRepository(BookingItem)
    private readonly bookingItemRepository: Repository<BookingItem>,

    private readonly dataSource: DataSource,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // GET /tickets/:bookingId
  // ────────────────────────────────────────────────────────────────────────────

  async getTicketDetails(
    bookingId: string,
    userId: string,
    userRole: UserRole,
  ) {
    const booking = await this.loadBookingWithFullRelations(bookingId);
    this.assertOwnership(booking, userId, userRole);

    return {
      message: 'Ticket details retrieved successfully',
      data: this.formatTicketResponse(booking),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST /tickets/verify
  // ────────────────────────────────────────────────────────────────────────────

  async verifyTicket(dto: VerifyTicketDto) {
    const bookingId = dto.qrPayload.replace('booking:', '');

    const booking = await this.loadBookingWithFullRelations(bookingId);

    // Guard 1 — Booking must be confirmed before any ticket action
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `Booking is not confirmed (current status: ${booking.status})`,
      );
    }

    // Guard 2 — Ticket already used
    if (booking.ticketStatus === TicketStatus.USED) {
      throw new ConflictException(
        `Ticket has already been used (checked in at ${booking.checkedInAt?.toISOString()})`,
      );
    }

    // Guard 3 — Ticket cancelled
    if (booking.ticketStatus === TicketStatus.CANCELLED) {
      throw new BadRequestException(
        'Ticket has been cancelled and is no longer valid',
      );
    }

    // Guard 4 — Belt-and-suspenders: checkedInAt already set
    if (booking.checkedInAt) {
      throw new ConflictException(
        `Ticket has already been checked in at ${booking.checkedInAt.toISOString()}`,
      );
    }

    // Atomically mark the ticket as used
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Booking, booking.id, {
        ticketStatus: TicketStatus.USED,
        checkedInAt: new Date(),
      });
    });

    this.logger.log(`Ticket checked in for booking ${booking.id}`);

    const updated = await this.loadBookingWithFullRelations(bookingId);
    return {
      message: 'Ticket verified and checked in successfully',
      data: this.formatTicketResponse(updated),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET /tickets/:bookingId/download
  // ────────────────────────────────────────────────────────────────────────────

  async downloadTicketPdf(
    bookingId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<StreamableFile> {
    const booking = await this.loadBookingWithFullRelations(bookingId);
    this.assertOwnership(booking, userId, userRole);

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'PDF tickets are only available for confirmed bookings',
      );
    }

    if (!booking.ticketNumber || !booking.qrPayload) {
      throw new BadRequestException('Ticket has not been issued yet');
    }

    // Generate QR code as base64 data URI
    const qrDataUri = await QRCode.toDataURL(booking.qrPayload, {
      width: 200,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    const html = this.buildTicketHtml(booking, qrDataUri);

    // Launch Puppeteer, render HTML, export PDF buffer — never touches disk
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return new StreamableFile(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  private async loadBookingWithFullRelations(
    bookingId: string,
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

    return booking;
  }

  private assertOwnership(
    booking: Booking,
    userId: string,
    userRole: UserRole,
  ): void {
    if (userRole !== UserRole.ADMIN && booking.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this ticket',
      );
    }
  }

  private formatTicketResponse(booking: Booking) {
    return {
      ticketNumber: booking.ticketNumber,
      ticketStatus: booking.ticketStatus,
      qrPayload: booking.qrPayload,
      issuedAt: booking.issuedAt,
      checkedInAt: booking.checkedInAt,
      booking: {
        id: booking.id,
        status: booking.status,
        totalAmount: booking.totalAmount,
        createdAt: booking.createdAt,
      },
      customer: {
        id: booking.user?.id,
        name: booking.user?.name,
        email: booking.user?.email,
      },
      event: {
        id: booking.event?.id,
        title: booking.event?.title,
        startTime: booking.event?.startTime,
        venue: booking.event?.venue
          ? {
              id: booking.event.venue.id,
              name: booking.event.venue.name,
              address: booking.event.venue.address,
            }
          : null,
      },
      seats: booking.items?.map((item) => ({
        bookingItemId: item.id,
        priceAtBooking: item.priceAtBooking,
        seat: item.eventSeat?.seat
          ? {
              id: item.eventSeat.seat.id,
              row: item.eventSeat.seat.row,
              seatNumber: item.eventSeat.seat.seatNumber,
              section: item.eventSeat.seat.section
                ? {
                    id: item.eventSeat.seat.section.id,
                    name: item.eventSeat.seat.section.name,
                  }
                : null,
            }
          : null,
      })),
    };
  }

  private buildTicketHtml(booking: Booking, qrDataUri: string): string {
    const event = booking.event;
    const venue = event?.venue;
    const customerName = booking.user?.name ?? booking.user?.email ?? 'Guest';

    const eventDate = event?.startTime
      ? new Date(event.startTime).toLocaleString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })
      : 'TBA';

    const seatsHtml = (booking.items ?? [])
      .map((item) => {
        const seat = item.eventSeat?.seat;
        const section = seat?.section?.name ?? '—';
        const seatLabel = `Row ${seat?.row ?? '?'}, Seat ${seat?.seatNumber ?? '?'}`;
        return `
          <tr>
            <td>${section}</td>
            <td>${seatLabel}</td>
            <td>₹${parseFloat(item.priceAtBooking).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>`;
      })
      .join('');

    const statusColor =
      booking.ticketStatus === TicketStatus.USED
        ? '#f59e0b'
        : booking.ticketStatus === TicketStatus.CANCELLED
          ? '#ef4444'
          : '#10b981';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Ticket — ${booking.ticketNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #f0f4ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .ticket {
      width: 680px;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.12);
    }
    .ticket-header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      padding: 36px 40px;
      color: #ffffff;
      position: relative;
    }
    .ticket-header::after {
      content: '';
      position: absolute;
      bottom: -1px; left: 0; right: 0;
      height: 24px;
      background: #ffffff;
      border-radius: 100% 100% 0 0;
    }
    .brand { font-size: 12px; font-weight: 600; letter-spacing: 3px; color: #a5b4fc; text-transform: uppercase; margin-bottom: 16px; }
    .event-title { font-size: 28px; font-weight: 800; line-height: 1.2; margin-bottom: 8px; }
    .event-meta { font-size: 14px; color: #c7d2fe; display: flex; gap: 20px; flex-wrap: wrap; }
    .ticket-body { padding: 36px 40px; display: flex; gap: 32px; }
    .ticket-info { flex: 1; }
    .ticket-qr { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .ticket-qr img { width: 160px; height: 160px; border-radius: 12px; border: 3px solid #e0e7ff; }
    .qr-label { font-size: 10px; color: #6b7280; text-align: center; letter-spacing: 1px; text-transform: uppercase; }
    .info-row { margin-bottom: 20px; }
    .info-label { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; }
    .info-value { font-size: 15px; font-weight: 500; color: #1f2937; }
    .ticket-number { font-size: 22px; font-weight: 800; color: #4f46e5; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      background: ${statusColor}22;
      color: ${statusColor};
      border: 1px solid ${statusColor}44;
    }
    .divider {
      border: none;
      border-top: 2px dashed #e5e7eb;
      margin: 8px 0 20px;
      position: relative;
    }
    .seats-section { margin-top: 4px; }
    .seats-label { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { text-align: left; font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; padding: 0 0 8px; border-bottom: 1px solid #f3f4f6; }
    tbody td { padding: 8px 0; color: #374151; border-bottom: 1px solid #f9fafb; }
    tbody tr:last-child td { border-bottom: none; }
    .ticket-footer {
      background: #f9fafb;
      border-top: 2px dashed #e5e7eb;
      padding: 20px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-note { font-size: 11px; color: #9ca3af; }
    .footer-total { font-size: 16px; font-weight: 700; color: #1f2937; }
    .footer-total span { font-size: 11px; font-weight: 400; color: #9ca3af; margin-right: 4px; }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="ticket-header">
      <div class="brand">🎫 Venue Flow</div>
      <div class="event-title">${event?.title ?? 'Event'}</div>
      <div class="event-meta">
        <span>📅 ${eventDate}</span>
        ${venue ? `<span>📍 ${venue.name}${venue.address ? `, ${venue.address}` : ''}</span>` : ''}
      </div>
    </div>

    <div class="ticket-body">
      <div class="ticket-info">
        <div class="info-row">
          <div class="info-label">Ticket Number</div>
          <div class="ticket-number">${booking.ticketNumber}</div>
        </div>

        <div class="info-row">
          <div class="info-label">Ticket Status</div>
          <div><span class="status-badge">${booking.ticketStatus ?? '—'}</span></div>
        </div>

        <div class="info-row">
          <div class="info-label">Attendee</div>
          <div class="info-value">${customerName}</div>
        </div>

        <div class="info-row">
          <div class="info-label">Issued At</div>
          <div class="info-value">${booking.issuedAt ? new Date(booking.issuedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</div>
        </div>

        ${
          booking.checkedInAt
            ? `<div class="info-row">
          <div class="info-label">Checked In At</div>
          <div class="info-value">${new Date(booking.checkedInAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
        </div>`
            : ''
        }

        <hr class="divider" />

        <div class="seats-section">
          <div class="seats-label">Booked Seats</div>
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>Seat</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              ${seatsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <div class="ticket-qr">
        <img src="${qrDataUri}" alt="QR Code" />
        <div class="qr-label">Scan to verify</div>
      </div>
    </div>

    <div class="ticket-footer">
      <div class="footer-note">Booking ID: ${booking.id}</div>
      <div class="footer-total">
        <span>Total</span>₹${parseFloat(booking.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}
