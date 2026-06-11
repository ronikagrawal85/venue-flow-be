import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SectionPriceDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Section UUID to apply the price override to',
  })
  @IsUUID('4')
  sectionId: string;

  @ApiProperty({
    example: 2500,
    description: 'Ticket price for this specific section (₹)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  price: number;
}

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
    example: 500,
    description:
      'Fallback ticket price applied to all seats whose section is not listed in sectionPricing (₹)',
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  defaultPrice: number;

  @ApiProperty({
    type: [SectionPriceDto],
    required: false,
    description:
      'Per-section price overrides. Any section not listed here falls back to defaultPrice.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SectionPriceDto)
  sectionPricing?: SectionPriceDto[];
}
