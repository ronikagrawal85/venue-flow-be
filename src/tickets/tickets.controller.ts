import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtUser } from '../auth/interfaces/request-with-user.interface';
import { UserRole } from '../users/entities/user.entity';
import { VerifyTicketDto } from './dto/verify-ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth('access-token')
@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ── Owner / Admin: view full ticket details ────────────────────────────────

  @Get(':bookingId')
  @ApiOperation({
    summary: 'Get ticket details for a booking',
    description:
      'Returns booking info, event details, booked seats, ticket number, status, and QR payload. Only the booking owner or an admin can access.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Ticket details returned' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getTicketDetails(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ticketsService.getTicketDetails(bookingId, user.id, user.role);
  }

  // ── Staff / Admin: verify QR payload and mark as checked in ───────────────

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @ApiOperation({
    summary: 'Verify a ticket by QR payload [ADMIN / ORGANIZER]',
    description:
      'Validates the QR payload, enforces check-in rules, then marks the ticket as USED and sets checkedInAt. Returns full booking and seat details.',
  })
  @ApiResponse({ status: 200, description: 'Ticket verified and checked in' })
  @ApiResponse({
    status: 400,
    description: 'Booking not confirmed or ticket cancelled',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'Ticket already used' })
  async verifyTicket(@Body() dto: VerifyTicketDto) {
    return this.ticketsService.verifyTicket(dto);
  }

  // ── Owner / Admin: download PDF ticket ────────────────────────────────────

  @Get(':bookingId/download')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="ticket.pdf"')
  @ApiOperation({
    summary: 'Download PDF ticket for a booking',
    description:
      'Generates a PDF on-demand containing event details, customer name, all booked seats, ticket number, and an embedded QR code. PDF is never stored on disk.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'PDF file streamed as application/pdf',
  })
  @ApiResponse({ status: 400, description: 'Booking not confirmed' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async downloadTicketPdf(
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ticketsService.downloadTicketPdf(bookingId, user.id, user.role);
  }
}
