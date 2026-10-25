import { randomUUID } from 'node:crypto';
import { signInAs, type IntegrationContext } from './integration-app';

export interface MemberOptions {
  email: string;
  name?: string;
  gender?: 'woman' | 'man' | 'non_binary';
  interestedIn?: ('men' | 'women' | 'non_binary')[];
  age?: number;
  /** Defaults to central Bengaluru. */
  latitude?: number;
  longitude?: number;
  photos?: number;
  minAge?: number;
  maxAge?: number;
  maxDistanceKm?: number;
  showDistance?: boolean;
  expandRadiusWhenEmpty?: boolean;
}

export interface Member {
  id: string;
  token: string;
  photoIds: string[];
  promptAnswerIds: string[];
}

/**
 * A member who finished onboarding, created directly in the database (signing in still goes
 * through the API so the token is real). Photo rows point at keys that need not exist.
 */
export async function createMember(ctx: IntegrationContext, opts: MemberOptions): Promise<Member> {
  const token = await signInAs(ctx, opts.email);
  const { rows } = await ctx.db.query<{ user_id: string }>(
    "SELECT user_id FROM auth_identities WHERE provider = 'email' AND subject = $1",
    [opts.email],
  );
  const id = rows[0].user_id;
  const age = opts.age ?? 28;
  const lat = opts.latitude ?? 12.9716;
  const lon = opts.longitude ?? 77.5946;

  await ctx.db.query(
    `INSERT INTO profiles (user_id, display_name, birth_date, gender, height_cm, location,
       location_accuracy_m, location_updated_at, place_id, onboarding_completed_at)
     VALUES ($1, $2, (now() - make_interval(years => $3::int) - interval '10 days')::date, $4, 170,
       ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, 20, now(),
       (SELECT id FROM places ORDER BY location <-> ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography LIMIT 1),
       now())`,
    [id, opts.name ?? opts.email.split('@')[0], age, opts.gender ?? 'woman', lat, lon],
  );
  for (const value of opts.interestedIn ?? ['men']) {
    await ctx.db.query(
      "INSERT INTO profile_attributes (user_id, kind, value) VALUES ($1, 'interested_in', $2)",
      [id, value],
    );
  }
  await ctx.db.query(
    "INSERT INTO profile_attributes (user_id, kind, value) VALUES ($1, 'hoping_to_find', 'long_term_relationship')",
    [id],
  );

  const photoIds: string[] = [];
  for (let position = 1; position <= (opts.photos ?? 4); position += 1) {
    const photoId = randomUUID();
    photoIds.push(photoId);
    await ctx.db.query(
      `INSERT INTO profile_photos (id, user_id, storage_key, position, status, content_type, width, height, uploaded_at)
       VALUES ($1, $2, $3, $4, 'approved', 'image/jpeg', 1080, 1350, now())`,
      [photoId, id, `photos/${id}/${photoId}`, position],
    );
  }

  const promptAnswerIds: string[] = [];
  const library = await ctx.db.query<{ id: string }>(
    'SELECT id FROM prompts ORDER BY sort_order LIMIT 3',
  );
  for (const [index, prompt] of library.rows.entries()) {
    const answerId = randomUUID();
    promptAnswerIds.push(answerId);
    await ctx.db.query(
      'INSERT INTO profile_prompts (id, user_id, prompt_id, answer, position) VALUES ($1, $2, $3, $4, $5)',
      [answerId, id, prompt.id, `Answer ${index + 1}`, index + 1],
    );
  }

  await ctx.db.query(
    `INSERT INTO preferences (user_id, min_age, max_age, max_distance_km, show_distance, expand_radius_when_empty)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      opts.minAge ?? 18,
      opts.maxAge ?? 60,
      opts.maxDistanceKm ?? 50,
      opts.showDistance ?? true,
      opts.expandRadiusWhenEmpty ?? true,
    ],
  );
  await ctx.db.query("UPDATE users SET status = 'active', last_active_at = now() WHERE id = $1", [
    id,
  ]);
  return { id, token, photoIds, promptAnswerIds };
}
