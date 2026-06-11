import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { createClient } from 'redis';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        const redisUrl = process.env.REDIS_PASSWORD
          ? `rediss://default:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
          : `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;

        console.log('Redis URL:', redisUrl);

        return {
          stores: [createKeyv(redisUrl)],
          ttl: 60_000,
        };
      },
    }),
  ],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const redisUrl = process.env.REDIS_PASSWORD
          ? `rediss://default:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
          : `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
        
        const client = createClient({ url: redisUrl });
        await client.connect();
        return client;
      },
    },
  ],
  exports: [CacheModule, 'REDIS_CLIENT'],
})
export class RedisModule {}
