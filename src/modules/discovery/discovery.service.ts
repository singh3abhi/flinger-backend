import { Injectable } from '@nestjs/common';
import { DomainError } from '@/common/errors/domain-error';
import { ErrorCode } from '@/common/errors/error-codes';
import { MatchingService } from '@/modules/matching';
import { ProfilesService, type PublicCard, type PublicProfileDto } from '@/modules/profiles';
import { DeckStore } from './deck-store';
import { DiscoveryRepository, type ViewerContext } from './discovery.repository';
import type { DeckDto } from './dto/discovery.dto';
import { assembleDeck, roundDistance, scoreCandidate } from './scoring';

/** Radius steps used when nobody is left nearby (docs/14 step 1). */
const RADIUS_STEPS_KM = [25, 50, 100, 200];
const ENOUGH_CANDIDATES = 50;
/** Refill when fewer cards than this are waiting. */
const REFILL_BELOW = 5;

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly repo: DiscoveryRepository,
    private readonly deck: DeckStore,
    private readonly profiles: ProfilesService,
    private readonly matching: MatchingService,
  ) {}

  /** The next cards. Refills the deck when it runs low, and re-checks every card before serving. */
  async nextCards(userId: string, limit: number): Promise<DeckDto> {
    const viewer = await this.repo.viewer(userId);
    if (!viewer?.hasLocation) {
      throw new DomainError(
        ErrorCode.DISCOVERY_NOT_READY,
        'Finish your profile and share your location to start discovering.',
        { status: 409 },
      );
    }
    if ((await this.deck.size(userId)) < REFILL_BELOW) await this.refill(viewer);

    const cards: PublicCard[] = [];
    // Cards can drop out between refill and now (paused, hidden, already decided): take more.
    for (let round = 0; round < 3 && cards.length < limit; round += 1) {
      const ids = await this.deck.take(userId, (limit - cards.length) * 2);
      if (ids.length === 0) break;
      const unseen = await this.matching.seenFilter().unseen(userId, ids);
      const fresh = await this.profiles.publicProfiles(unseen);
      for (const id of unseen) {
        const card = fresh.get(id);
        if (card && cards.length < limit) cards.push(card);
      }
    }

    const distances = await this.repo.distancesFrom(
      userId,
      cards.map((c) => c.userId),
    );
    await this.deck.markShown(
      userId,
      cards.map((c) => c.userId),
    );
    const meta = (await this.deck.meta(userId)) ?? {
      radiusKm: viewer.maxDistanceKm,
      widened: false,
    };
    return {
      items: cards.map((card) => this.toPublic(card, distances.get(card.userId))),
      ...meta,
    };
  }

  /**
   * One member's full profile, only for people this member may see: served in their deck, liked
   * them, or matched. No browsing arbitrary ids.
   */
  async profile(userId: string, otherId: string): Promise<PublicProfileDto> {
    const allowed =
      otherId !== userId &&
      ((await this.deck.wasShown(userId, otherId)) ||
        (await this.matching.isConnected(userId, otherId)));
    const card = allowed ? (await this.profiles.publicProfiles([otherId])).get(otherId) : undefined;
    if (!card) {
      throw new DomainError(ErrorCode.MEMBER_NOT_FOUND, 'This profile is no longer available.', {
        status: 404,
      });
    }
    const distances = await this.repo.distancesFrom(userId, [otherId]);
    return this.toPublic(card, distances.get(otherId));
  }

  /** Steps 1–4: candidates, filter, score, assemble. */
  private async refill(viewer: ViewerContext): Promise<void> {
    const { userId } = viewer;
    let radiusKm = viewer.maxDistanceKm;
    let candidates = await this.repo.candidates(userId, radiusKm);
    let widened = false;
    if (candidates.length < ENOUGH_CANDIDATES && viewer.expandRadiusWhenEmpty) {
      for (const step of RADIUS_STEPS_KM.filter((km) => km > viewer.maxDistanceKm)) {
        radiusKm = step;
        widened = true;
        candidates = await this.repo.candidates(userId, step);
        if (candidates.length >= ENOUGH_CANDIDATES) break;
      }
    }

    const unseen = new Set(
      await this.matching.seenFilter().unseen(
        userId,
        candidates.map((c) => c.userId),
      ),
    );
    const pool = candidates.filter((c) => unseen.has(c.userId));
    const ids = pool.map((c) => c.userId);
    const [signals, likers, mine] = await Promise.all([
      this.profiles.rankingSignals(ids),
      this.matching.likersAmong(userId, ids),
      this.profiles.rankingSignals([userId]),
    ]);
    const me = mine.get(userId);
    const viewerSignals = {
      hopingToFind: me?.hopingToFind ?? [],
      values: me?.values ?? [],
      causes: me?.causes ?? [],
      familyPlans: me?.familyPlans ?? null,
    };
    const now = new Date();
    const scored = pool.map((c) => {
      const s = signals.get(c.userId);
      return {
        userId: c.userId,
        score: scoreCandidate(
          viewerSignals,
          {
            ...c,
            hopingToFind: s?.hopingToFind ?? [],
            values: s?.values ?? [],
            causes: s?.causes ?? [],
            kidsStatus: s?.kidsStatus ?? null,
            familyPlans: s?.familyPlans ?? null,
            hasBio: s?.hasBio ?? false,
            likedMe: likers.has(c.userId),
          },
          now,
        ),
      };
    });
    await this.deck.replace(userId, assembleDeck(scored), { radiusKm, widened });
  }

  private toPublic(card: PublicCard, distanceKm: number | undefined): PublicProfileDto {
    const { showDistance, ...profile } = card;
    return {
      ...profile,
      distanceKm: showDistance && distanceKm !== undefined ? roundDistance(distanceKm) : null,
    };
  }
}
