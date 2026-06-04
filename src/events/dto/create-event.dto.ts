import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({
    example: 'Coldplay World Tour 2026',
    description: 'Event title',
  })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'An unforgettable night with Coldplay.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: '2026-12-31T19:00:00.000Z',
    description: 'ISO 8601 start datetime',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Venue ID',
  })
  @IsUUID('4')
  venueId: string;

  @ApiProperty({
    example: 1500,
    description: 'Default ticket price applied to all seats (₹)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  defaultPrice: number;
}
