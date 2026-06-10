import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { BookingsService } from './bookings.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { ListMyBookingsQueryDto } from './dto/list-my-bookings-query.dto';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ── Customer routes ────────────────────────────────────────────────────────

  @Get('me/stats')
  @ApiOperation({
    summary: 'Get booking statistics for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Booking stats (total, confirmed, cancelled, spent, etc.)',
  })
  async getMyBookingStats(@CurrentUser() user: JwtUser) {
    return this.bookingsService.getMyBookingStats(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Locks the selected event-seats and creates a PENDING booking. Seats transition: AVAILABLE → LOCKED.',
  })
  @ApiResponse({
    status: 201,
    description: 'Booking created (PENDING), seats locked',
  })
  @ApiResponse({
    status: 400,
    description: 'Event not published or invalid input',
  })
  @ApiResponse({ status: 404, description: 'Event or seat IDs not found' })
  @ApiResponse({
    status: 409,
    description: 'One or more seats are not available',
  })
  async createBooking(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(dto, user.id);
  }

  @Get('me')
  @ApiOperation({
    summary:
      "List the authenticated user's own bookings with optional filter and pagination",
  })
  @ApiResponse({ status: 200, description: 'Paginated list of own bookings' })
  async getMyBookings(
    @CurrentUser() user: JwtUser,
    @Query() query: ListMyBookingsQueryDto,
  ) {
    return this.bookingsService.getMyBookings(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single booking by ID (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'Booking details with seats and event',
  })
  @ApiResponse({ status: 403, description: 'Not your booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBookingById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookingsService.getBookingById(id, user.id, user.role);
  }

  @Patch(':id/confirm')
  @ApiOperation({
    summary: 'Confirm a PENDING booking',
    description:
      'Transitions the booking to CONFIRMED and marks seats as BOOKED.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking confirmed, seats BOOKED' })
  @ApiResponse({ status: 400, description: 'Booking is not in PENDING state' })
  @ApiResponse({ status: 403, description: 'Not your booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async confirmBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookingsService.confirmBooking(id, user.id, user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a booking',
    description: 'Cancels the booking and releases seats back to AVAILABLE.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled, seats released',
  })
  @ApiResponse({ status: 400, description: 'Booking already cancelled' })
  @ApiResponse({ status: 403, description: 'Not your booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async cancelBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancelBooking(id, dto, user.id, user.role);
  }

  // ── Admin routes ───────────────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List all bookings with pagination, filters and sorting [ADMIN]',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of all bookings' })
  async adminListBookings(@Query() query: ListBookingsQueryDto) {
    return this.bookingsService.adminListBookings(query);
  }
}
