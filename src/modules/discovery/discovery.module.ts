import { Module } from '@nestjs/common';
import { MatchingModule } from '@/modules/matching';
import { ProfilesModule } from '@/modules/profiles';
import { UsersModule } from '@/modules/users';
import { DeckStore } from './deck-store';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryRepository } from './discovery.repository';
import { DiscoveryService } from './discovery.service';

/** The Discover deck: candidates, ranking, the Redis deck and profile views (docs/14). */
@Module({
  imports: [ProfilesModule, MatchingModule, UsersModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryRepository, DeckStore, DiscoveryService],
})
export class DiscoveryModule {}
