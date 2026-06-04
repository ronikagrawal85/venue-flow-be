import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsUUID, Min } from 'class-validator';

export class BulkCreateSeatsDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Section ID',
  })
  @IsUUID()
  sectionId: string;

  @ApiProperty({
    example: ['A', 'B', 'C'],
    description: 'Row labels to generate',
  })
  @IsArray()
  rows: string[];

  @ApiProperty({
    example: 20,
    description: 'Number of seats per row',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  seatsPerRow: number;
}
