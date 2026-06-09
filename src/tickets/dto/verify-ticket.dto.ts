import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTicketDto {
  @ApiProperty({
    description: 'QR payload encoded on the ticket',
    example: 'booking:550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^booking:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    {
      message: 'qrPayload must match the format booking:<uuid>',
    },
  )
  qrPayload: string;
}
