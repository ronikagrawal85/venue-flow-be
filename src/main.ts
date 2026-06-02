import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/allexceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically remove properties that do not have any decorators
      forbidNonWhitelisted: true, // Throw an error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors();

  // ── Swagger ──────────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('VenueFlow API')
    .setDescription(
      'Backend API for VenueFlow — a venue & event booking platform.\n\n' +
        '**Authentication:** All protected routes require a Bearer JWT token obtained from `POST /v1/auth/login`.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('Auth', 'Register & login')
    .addTag('Venues', 'Venue, section and seat management')
    .addTag('Events', 'Event lifecycle management')
    .addTag('Bookings', 'Seat reservation and booking management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(process.env.PORT ?? 3000);

  console.log(
    `\n🚀 VenueFlow API running at http://localhost:${process.env.PORT ?? 3000}/v1`,
  );
  console.log(
    `📄 Swagger docs at  http://localhost:${process.env.PORT ?? 3000}/docs\n`,
  );
}

void bootstrap();
