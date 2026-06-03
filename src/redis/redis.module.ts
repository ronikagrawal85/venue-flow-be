import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import KeyvRedis from '@keyv/redis';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,

      useFactory: () => {
        console.log('Redis Host:', process.env.REDIS_HOST);

        return {
          stores: [
            new KeyvRedis(
              `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
            ),
          ],
          ttl: 60_000,
        };
      },
    }),
  ],

  exports: [CacheModule],
})
export class RedisModule {}
