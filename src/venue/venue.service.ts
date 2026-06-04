import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { buildPaginatedResponse } from '../common/dto/paginated-response.helper';
import { SortOrder } from '../common/dto/pagination-query.dto';
import { CACHE_KEYS, CACHE_TTL } from '../common/constants/cache.constants';

import { Seat } from '../seats/entities/seat.entity';

import { BulkCreateSeatsDto } from './dto/bulk-create-seats.dto';
import { BulkUpdateSeatsDto } from './dto/bulk-update-seats.dto';
import { CreateSectionDto } from './dto/create-section.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { ListVenuesQueryDto } from './dto/list-venues-query.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';

import { VenueSection } from './entities/venue-section.entity';
import { Venue } from './entities/venue.entity';

@Injectable()
export class VenueService {
  constructor(
    @InjectRepository(Venue)
    private readonly venueRepository: Repository<Venue>,

    @InjectRepository(VenueSection)
    private readonly sectionRepository: Repository<VenueSection>,

    @InjectRepository(Seat)
    private readonly seatRepository: Repository<Seat>,

    private readonly dataSource: DataSource,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async createVenue(dto: CreateVenueDto) {
    const venue = this.venueRepository.create(dto);

    const savedVenue = await this.venueRepository.save(venue);

    // Clear cache to invalidate list caches
    await this.cacheManager.clear?.();

    return {
      message: 'Venue created successfully',
      data: savedVenue,
    };
  }

  async findAllVenues(query: ListVenuesQueryDto) {
    const cacheKey = CACHE_KEYS.VENUE_LIST(query);
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) return cachedData;

    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = SortOrder.DESC,
    } = query;

    const skip = (page - 1) * limit;

    const qb = this.venueRepository
      .createQueryBuilder('venue')
      .leftJoinAndSelect('venue.sections', 'sections')
      .orderBy(`venue.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    if (search) {
      qb.andWhere('(venue.name ILIKE :search OR venue.city ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [venues, total] = await qb.getManyAndCount();

    const result = buildPaginatedResponse(
      'Venues retrieved successfully',
      venues,
      total,
      page,
      limit,
    );

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.SHORT);
    return result;
  }

  async findVenueById(id: string): Promise<Venue> {
    const cacheKey = CACHE_KEYS.VENUE_DETAIL(id);
    const cachedData = await this.cacheManager.get<Venue>(cacheKey);
    if (cachedData) return cachedData;

    const venue = await this.venueRepository.findOne({
      where: { id },
      relations: ['sections', 'sections.seats'],
    });

    if (!venue) {
      throw new NotFoundException(`Venue with ID ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, venue, CACHE_TTL.MEDIUM);
    return venue;
  }

  async createSection(dto: CreateSectionDto) {
    const venueExists = await this.venueRepository.existsBy({
      id: dto.venueId,
    });

    if (!venueExists) {
      throw new NotFoundException(`Venue with ID ${dto.venueId} not found`);
    }

    const section = this.sectionRepository.create(dto);

    const savedSection = await this.sectionRepository.save(section);

    await this.cacheManager.del(CACHE_KEYS.VENUE_DETAIL(dto.venueId));

    return {
      message: 'Venue section created successfully',
      data: savedSection,
    };
  }

  async bulkCreateSeats(dto: BulkCreateSeatsDto) {
    const section = await this.sectionRepository.findOne({
      where: { id: dto.sectionId },
    });

    if (!section) {
      throw new NotFoundException(
        `Venue section with ID ${dto.sectionId} not found`,
      );
    }

    const seats: Seat[] = [];

    for (const row of dto.rows) {
      for (let i = 1; i <= dto.seatsPerRow; i++) {
        seats.push(
          this.seatRepository.create({
            row: row.trim().toUpperCase(),
            seatNumber: String(i),
            sectionId: dto.sectionId,
          }),
        );
      }
    }

    const existingSeats = await this.seatRepository.find({
      where: {
        sectionId: dto.sectionId,
      },
      select: ['row', 'seatNumber'],
    });

    const existingSeatSet = new Set(
      existingSeats.map((seat) => `${seat.row}-${seat.seatNumber}`),
    );

    const duplicateSeats = seats.filter((seat) =>
      existingSeatSet.has(`${seat.row}-${seat.seatNumber}`),
    );

    if (duplicateSeats.length > 0) {
      throw new BadRequestException('Some seats already exist in this section');
    }

    const savedSeats = await this.dataSource.transaction(async (manager) => {
      return await manager.save(seats);
    });

    await this.cacheManager.del(CACHE_KEYS.VENUE_DETAIL(section.venueId));

    return {
      message: 'Seats created successfully',
      count: savedSeats.length,
    };
  }

  async updateVenue(id: string, dto: UpdateVenueDto) {
    const venue = await this.findVenueById(id);

    const updatedVenue = this.venueRepository.merge(venue, dto);

    const savedVenue = await this.venueRepository.save(updatedVenue);

    await this.cacheManager.del(CACHE_KEYS.VENUE_DETAIL(id));

    return {
      message: 'Venue updated successfully',
      data: savedVenue,
    };
  }

  async deleteVenue(id: string) {
    const venue = await this.findVenueById(id);

    await this.venueRepository.remove(venue);

    await this.cacheManager.del(CACHE_KEYS.VENUE_DETAIL(id));
    // Clear cache to invalidate list caches
    await this.cacheManager.clear?.();

    return {
      message: 'Venue deleted successfully',
    };
  }

  async updateSection(id: string, dto: UpdateSectionDto) {
    const section = await this.sectionRepository.findOne({
      where: { id },
    });

    if (!section) {
      throw new NotFoundException(`Venue section with ID ${id} not found`);
    }

    const updatedSection = this.sectionRepository.merge(section, dto);

    const savedSection = await this.sectionRepository.save(updatedSection);

    await this.cacheManager.del(CACHE_KEYS.VENUE_DETAIL(section.venueId));

    return {
      message: 'Venue section updated successfully',
      data: savedSection,
    };
  }

  async deleteSection(id: string) {
    const section = await this.sectionRepository.findOne({
      where: { id },
    });

    if (!section) {
      throw new NotFoundException(`Venue section with ID ${id} not found`);
    }

    await this.sectionRepository.remove(section);

    await this.cacheManager.del(CACHE_KEYS.VENUE_DETAIL(section.venueId));

    return {
      message: 'Venue section deleted successfully',
    };
  }

  async bulkUpdateSeats(dto: BulkUpdateSeatsDto) {
    if (!dto.seatIds || dto.seatIds.length === 0) {
      throw new BadRequestException('Seat IDs are required');
    }

    const seats = await this.seatRepository.findBy({
      id: In(dto.seatIds),
    });

    if (seats.length !== dto.seatIds.length) {
      throw new NotFoundException('Some seats were not found');
    }

    await this.seatRepository.update(
      {
        id: In(dto.seatIds),
      },
      {
        isAccessible: dto.isAccessible,
      },
    );

    const firstSeat = await this.seatRepository.findOne({
      where: { id: dto.seatIds[0] },
      relations: ['section'],
    });
    if (firstSeat) {
      await this.cacheManager.del(
        CACHE_KEYS.VENUE_DETAIL(firstSeat.section.venueId),
      );
    }

    return {
      message: 'Seats updated successfully',
      updatedCount: dto.seatIds.length,
    };
  }
}
