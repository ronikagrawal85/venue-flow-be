import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { BulkCreateSeatsDto } from './dto/bulk-create-seats.dto';
import { BulkUpdateSeatsDto } from './dto/bulk-update-seats.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { ListVenuesQueryDto } from './dto/list-venues-query.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenueService } from './venue.service';

@ApiTags('Venues')
@Controller('venues')
export class VenueController {
  constructor(private readonly venueService: VenueService) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'List all venues with pagination, search and sorting (public)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of venues with sections',
  })
  async findAllVenues(@Query() query: ListVenuesQueryDto) {
    return await this.venueService.findAllVenues(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single venue with all sections and seats' })
  @ApiParam({ name: 'id', description: 'Venue UUID' })
  @ApiResponse({ status: 200, description: 'Venue details' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async findVenueById(@Param('id') id: string) {
    return await this.venueService.findVenueById(id);
  }

  // ── Admin / Organizer ───────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new venue  [ORGANIZER, ADMIN]' })
  @ApiResponse({ status: 201, description: 'Venue created' })
  async createVenue(@Body() createVenueDto: CreateVenueDto) {
    return await this.venueService.createVenue(createVenueDto);
  }

  @Post('sections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Add a section to a venue  [ORGANIZER, ADMIN]' })
  @ApiResponse({ status: 201, description: 'Section created' })
  async createSection(@Body() createSectionDto: CreateSectionDto) {
    return await this.venueService.createSection(createSectionDto);
  }

  @Post('seats/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Bulk-generate seats for a section  [ORGANIZER, ADMIN]',
  })
  @ApiResponse({ status: 201, description: 'Seats created' })
  async bulkCreateSeats(@Body() bulkCreateSeatsDto: BulkCreateSeatsDto) {
    return await this.venueService.bulkCreateSeats(bulkCreateSeatsDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a venue  [ORGANIZER, ADMIN]' })
  @ApiParam({ name: 'id', description: 'Venue UUID' })
  @ApiResponse({ status: 200, description: 'Venue updated' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  async updateVenue(
    @Param('id') id: string,
    @Body() updateVenueDto: UpdateVenueDto,
  ) {
    return await this.venueService.updateVenue(id, updateVenueDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a venue  [ORGANIZER, ADMIN]' })
  @ApiParam({ name: 'id', description: 'Venue UUID' })
  @ApiResponse({ status: 200, description: 'Venue deleted' })
  async deleteVenue(@Param('id') id: string) {
    return await this.venueService.deleteVenue(id);
  }

  @Patch('sections/:sectionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a section  [ORGANIZER, ADMIN]' })
  @ApiParam({ name: 'sectionId', description: 'Section UUID' })
  @ApiResponse({ status: 200, description: 'Section updated' })
  async updateSection(
    @Param('sectionId') sectionId: string,
    @Body() updateSectionDto: UpdateSectionDto,
  ) {
    return await this.venueService.updateSection(sectionId, updateSectionDto);
  }

  @Delete('sections/:sectionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a section  [ORGANIZER, ADMIN]' })
  @ApiParam({ name: 'sectionId', description: 'Section UUID' })
  @ApiResponse({ status: 200, description: 'Section deleted' })
  async deleteSection(@Param('sectionId') sectionId: string) {
    return await this.venueService.deleteSection(sectionId);
  }

  @Patch('seats/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Bulk-update seat accessibility  [ORGANIZER, ADMIN]',
  })
  @ApiResponse({ status: 200, description: 'Seats updated' })
  async bulkUpdateSeats(@Body() bulkUpdateSeatsDto: BulkUpdateSeatsDto) {
    return await this.venueService.bulkUpdateSeats(bulkUpdateSeatsDto);
  }
}
