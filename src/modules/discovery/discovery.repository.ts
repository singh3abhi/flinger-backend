import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '@/infra/database/database.module';

export interface ViewerContext {
  userId: string;
  maxDistanceKm: number;
  expandRadiusWhenEmpty: boolean;
  hasLocation: boolean;
}

export interface CandidateRow {
  userId: string;
  distanceKm: number;
  lastActiveAt: Date | null;
  createdAt: Date;
  photoCount: number;
  promptCount: number;
}

const CANDIDATE_LIMIT = 500;

/**
 * The candidate query (docs/14 step 1). Read-only SQL across profiles, users, preferences,
 * attributes and photos: the one place that reads other modules' tables, because the whole point is
 * a single indexed query. Writes to those tables still go through their own modules.
 */
@Injectable()
export class DiscoveryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async viewer(userId: string): Promise<ViewerContext | undefined> {
    const { rows } = await this.db.execute<{
      max_distance_km: number;
      expand_radius_when_empty: boolean;
      has_location: boolean;
    }>(sql`
      SELECT pr.max_distance_km, pr.expand_radius_when_empty, p.location IS NOT NULL AS has_location
      FROM profiles p JOIN preferences pr ON pr.user_id = p.user_id
      WHERE p.user_id = ${userId}`);
    const row = rows[0];
    if (!row) return undefined;
    return {
      userId,
      maxDistanceKm: row.max_distance_km,
      expandRadiusWhenEmpty: row.expand_radius_when_empty,
      hasLocation: row.has_location,
    };
  }

  /**
   * People both sides would want to see: active, finished onboarding, visible, with an approved
   * photo, same dating mode, within my radius and I within theirs, in each other's age range, and
   * each other's gender wanted both ways. Nearest first (GiST KNN), at most 500.
   */
  async candidates(userId: string, radiusKm: number): Promise<CandidateRow[]> {
    const { rows } = await this.db.execute<{
      user_id: string;
      distance_m: number;
      last_active_at: Date | null;
      created_at: Date;
      photo_count: number;
      prompt_count: number;
    }>(sql`
      WITH me AS (
        SELECT p.user_id, p.location, p.gender, p.dating_mode,
               date_part('year', age(current_date, p.birth_date))::int AS age,
               pr.min_age, pr.max_age,
               CASE p.gender WHEN 'woman' THEN 'women' WHEN 'man' THEN 'men' ELSE 'non_binary' END AS as_wanted,
               ARRAY(SELECT value FROM profile_attributes WHERE user_id = p.user_id AND kind = 'interested_in') AS wants
        FROM profiles p JOIN preferences pr ON pr.user_id = p.user_id
        WHERE p.user_id = ${userId}
      )
      SELECT c.user_id,
             ST_Distance(c.location, me.location) AS distance_m,
             u.last_active_at, u.created_at,
             (SELECT count(*)::int FROM profile_photos ph WHERE ph.user_id = c.user_id AND ph.status = 'approved') AS photo_count,
             (SELECT count(*)::int FROM profile_prompts pp WHERE pp.user_id = c.user_id) AS prompt_count
      FROM me
      JOIN profiles c ON c.user_id <> me.user_id
      JOIN users u ON u.id = c.user_id AND u.status = 'active'
      JOIN preferences cp ON cp.user_id = c.user_id
      WHERE c.visibility = 'visible'
        AND c.onboarding_completed_at IS NOT NULL
        AND c.dating_mode = me.dating_mode
        AND c.location IS NOT NULL
        AND ST_DWithin(c.location, me.location, ${radiusKm * 1000})
        AND ST_DWithin(c.location, me.location, cp.max_distance_km * 1000)
        AND date_part('year', age(current_date, c.birth_date)) BETWEEN me.min_age AND me.max_age
        AND me.age BETWEEN cp.min_age AND cp.max_age
        AND (CASE c.gender WHEN 'woman' THEN 'women' WHEN 'man' THEN 'men' ELSE 'non_binary' END) = ANY (me.wants)
        AND EXISTS (SELECT 1 FROM profile_attributes a
                    WHERE a.user_id = c.user_id AND a.kind = 'interested_in' AND a.value = me.as_wanted)
        AND EXISTS (SELECT 1 FROM profile_photos ph WHERE ph.user_id = c.user_id AND ph.status = 'approved')
      ORDER BY c.location <-> me.location
      LIMIT ${CANDIDATE_LIMIT}`);
    return rows.map((r) => ({
      userId: r.user_id,
      distanceKm: Number(r.distance_m) / 1000,
      lastActiveAt: r.last_active_at ? new Date(r.last_active_at) : null,
      createdAt: new Date(r.created_at),
      photoCount: r.photo_count,
      promptCount: r.prompt_count,
    }));
  }

  /** Distance in km from the viewer to each of `ids` (for cards served later from the deck). */
  async distancesFrom(userId: string, ids: readonly string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const { rows } = await this.db.execute<{ user_id: string; distance_m: number }>(sql`
      SELECT c.user_id, ST_Distance(c.location, me.location) AS distance_m
      FROM profiles me, profiles c
      WHERE me.user_id = ${userId}
        AND c.user_id IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        AND c.location IS NOT NULL AND me.location IS NOT NULL`);
    return new Map(rows.map((r) => [r.user_id, Number(r.distance_m) / 1000]));
  }
}
