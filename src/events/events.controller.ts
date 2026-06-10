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
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventSeatsQueryDto } from './dto/list-event-seats-query.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ─── Organizer / Admin routes ──────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Create a new event and auto-generate event seats [ORGANIZER, ADMIN]',
  })
  @ApiResponse({ status: 201, description: 'Event created with seats' })
  @ApiResponse({ status: 400, description: 'Venue has no seats configured' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async createEvent(
    @CurrentUser() user: JwtUser,
    @Body() createEventDto: CreateEventDto,
  ) {
    const result = await this.eventsService.createEvent(
      createEventDto,
      user.id,
    );
    await this.eventsService.logEventCreation(
      result.data.id,
      user.id,
      createEventDto.title,
    );
    return result;
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Publish a draft event [ORGANIZER (owner), ADMIN]',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event published' })
  @ApiResponse({ status: 400, description: 'Event has no seats' })
  @ApiResponse({ status: 403, description: 'Not the event owner' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 409, description: 'Event already published' })
  async publishEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.eventsService.publishEvent(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update an event [ORGANIZER (owner), ADMIN]',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event updated' })
  @ApiResponse({ status: 403, description: 'Not the event owner' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(id, updateEventDto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete an event [ORGANIZER (owner), ADMIN]',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event deleted' })
  @ApiResponse({ status: 403, description: 'Not the event owner' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async deleteEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.eventsService.deleteEvent(id, user);
  }

  // ─── Public routes ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary:
      'List events with pagination, search, filters and sorting (public)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of events' })
  async listEvents(@Query() query: ListEventsQueryDto) {
    return this.eventsService.listEvents(query);
  }

  @Get(':id/seats')
  @ApiOperation({
    summary: 'Get all seats for an event with filters and sorting (public)',
  })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Filtered and sorted event seat list',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventSeats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListEventSeatsQueryDto,
  ) {
    return this.eventsService.getEventSeats(id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event details including all seats (public)' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({
    status: 200,
    description: 'Event with venue and seat details',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEventById(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getEventById(id);
  }
}
