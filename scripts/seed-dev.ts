/**
 * Local development only: creates ~40 finished members around central Bengaluru so Discover,
 * likes and matches can be tried end to end. Photos are generated placeholder art (a silhouette
 * on a gradient), never real people, uploaded to the local S3 (SeaweedFS).
 *
 *   pnpm seed:dev                                  # (re)create the seed members
 *   pnpm seed:dev --like you@example.com           # ...and have 6 of them like that account
 *
 * Seed members use emails seed-NN@flinger.test and are replaced on every run.
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { encode } from 'jpeg-js';
import { Pool } from 'pg';

if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
if ((env.APP_ENV ?? 'local') !== 'local') {
  console.error('seed:dev only runs with APP_ENV=local.');
  process.exit(1);
}

const COUNT = 40;
const CENTER = { lat: 12.9716, lon: 77.5946 };
const WOMEN = [
  'Ananya',
  'Diya',
  'Ishita',
  'Kavya',
  'Meera',
  'Nisha',
  'Pooja',
  'Riya',
  'Sana',
  'Tara',
  'Zoya',
  'Aditi',
  'Bhavna',
  'Charu',
  'Esha',
  'Gauri',
  'Hina',
  'Jaya',
];
const MEN = [
  'Aarav',
  'Arjun',
  'Dev',
  'Kabir',
  'Karan',
  'Neel',
  'Rohan',
  'Sahil',
  'Vikram',
  'Yash',
  'Aman',
  'Farhan',
  'Ishaan',
  'Manav',
  'Nikhil',
  'Pranav',
  'Rahul',
  'Tanmay',
];
const NB = ['Sam', 'Ari', 'Noor', 'Jai'];
const INTENTIONS = [
  'long_term_relationship',
  'life_partner',
  'casual',
  'marriage',
  'intimacy_no_commitment',
  'ethical_non_monogamy',
];
const VALUES = [
  'ambition',
  'confidence',
  'curiosity',
  'kindness',
  'honesty',
  'sense_of_humor',
  'empathy',
  'loyalty',
  'respect',
  'independence',
];
const ANSWERS = [
  'Filter coffee, a long walk at Cubbon Park and an unreasonable number of samosas.',
  'Finding the best chai stall in any city.',
  'Planning a trip I will definitely take this year.',
  'Bad puns, good playlists.',
  'Someone who texts back and means it.',
  'Board games with friends and too many snacks.',
  'Learning to cook my grandmother’s rasam.',
  'Weekend treks around Nandi Hills.',
];

const rand = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const sample = <T>(list: readonly T[], n: number) =>
  [...list].sort(() => Math.random() - 0.5).slice(0, n);

/** Placeholder portrait: gradient background, head and shoulders in a lighter tone. */
function placeholderJpeg(hue: number, variant: number): Buffer {
  const width = 600;
  const height = 750;
  const data = Buffer.alloc(width * height * 4);
  const hsl = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  const headY = height * (0.36 + variant * 0.02);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      let [r, g, b] = hsl((hue + variant * 25) % 360, 0.6, 0.62 - t * 0.28);
      const inHead = (x - width / 2) ** 2 + (y - headY) ** 2 < (width * 0.13) ** 2;
      const inBody =
        ((x - width / 2) / (width * 0.38)) ** 2 + ((y - height * 1.04) / (height * 0.4)) ** 2 < 1;
      if (inHead || inBody)
        [r, g, b] = [r + (255 - r) * 0.45, g + (255 - g) * 0.45, b + (255 - b) * 0.45];
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return encode({ data, width, height }, 80).data;
}

async function main() {
  const db = new Pool({ connectionString: env.DATABASE_URL });
  const s3 = new S3Client({
    region: env.S3_REGION ?? 'ap-south-1',
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const bucket = env.S3_BUCKET ?? 'flinger-photos-local';
  await s3.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined);

  const removed = await db.query(
    "DELETE FROM users WHERE id IN (SELECT user_id FROM auth_identities WHERE subject LIKE 'seed-%@flinger.test')",
  );
  console.log(`Removed ${removed.rowCount} previous seed members.`);

  const prompts = (
    await db.query<{ id: string }>('SELECT id FROM prompts WHERE active ORDER BY random() LIMIT 12')
  ).rows;
  const created: string[] = [];

  for (let n = 1; n <= COUNT; n += 1) {
    const gender = n % 10 === 0 ? 'non_binary' : n % 2 === 0 ? 'man' : 'woman';
    const name = gender === 'woman' ? rand(WOMEN) : gender === 'man' ? rand(MEN) : rand(NB);
    const wants =
      gender === 'non_binary'
        ? ['men', 'women', 'non_binary']
        : n % 7 === 0
          ? ['men', 'women']
          : [gender === 'man' ? 'women' : 'men'];
    const age = 22 + Math.floor(Math.random() * 17);
    // Within ~15 km of the centre.
    const lat = CENTER.lat + (Math.random() - 0.5) * 0.27;
    const lon = CENTER.lon + (Math.random() - 0.5) * 0.27;
    const email = `seed-${String(n).padStart(2, '0')}@flinger.test`;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (id, status, last_active_at, created_at)
         VALUES ($1, 'active', now() - make_interval(hours => $2::int), now() - make_interval(days => $3::int)) RETURNING id`,
        [randomUUID(), Math.floor(Math.random() * 120), 2 + Math.floor(Math.random() * 60)],
      );
      const id = user.rows[0].id;
      await client.query(
        "INSERT INTO auth_identities (id, user_id, provider, subject, verified_at) VALUES ($1, $2, 'email', $3, now())",
        [randomUUID(), id, email],
      );
      await client.query(
        `INSERT INTO profiles (user_id, display_name, birth_date, gender, height_cm, religion, location,
           location_accuracy_m, location_updated_at, place_id, onboarding_completed_at)
         VALUES ($1, $2, (current_date - make_interval(years => $3::int) - interval '40 days')::date, $4, $5, $6,
           ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography, 25, now(),
           (SELECT id FROM places ORDER BY location <-> ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography LIMIT 1), now())`,
        [
          id,
          name,
          age,
          gender,
          150 + Math.floor(Math.random() * 40),
          rand(['hindu', 'muslim', 'christian', 'sikh', 'spiritual', null]),
          lat,
          lon,
        ],
      );
      for (const value of wants) {
        await client.query("INSERT INTO profile_attributes VALUES ($1, 'interested_in', $2)", [
          id,
          value,
        ]);
      }
      for (const value of sample(INTENTIONS.slice(0, 4), 1 + (n % 2))) {
        await client.query("INSERT INTO profile_attributes VALUES ($1, 'hoping_to_find', $2)", [
          id,
          value,
        ]);
      }
      for (const value of sample(VALUES, 3)) {
        await client.query("INSERT INTO profile_attributes VALUES ($1, 'values', $2)", [id, value]);
      }
      for (const [i, prompt] of sample(prompts, 3).entries()) {
        await client.query(
          'INSERT INTO profile_prompts (id, user_id, prompt_id, answer, position) VALUES ($1, $2, $3, $4, $5)',
          [randomUUID(), id, prompt.id, rand(ANSWERS), i + 1],
        );
      }
      const hue = (n * 47) % 360;
      for (let position = 1; position <= 4; position += 1) {
        const photoId = randomUUID();
        const key = `photos/${id}/${photoId}`;
        const body = placeholderJpeg(hue, position);
        await s3.send(
          new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/jpeg' }),
        );
        await client.query(
          `INSERT INTO profile_photos (id, user_id, storage_key, position, status, content_type, byte_size, width, height, uploaded_at)
           VALUES ($1, $2, $3, $4, 'approved', 'image/jpeg', $5, 600, 750, now())`,
          [photoId, id, key, position, body.length],
        );
      }
      await client.query(
        'INSERT INTO preferences (user_id, min_age, max_age, max_distance_km) VALUES ($1, 18, 45, 50)',
        [id],
      );
      await client.query('COMMIT');
      created.push(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  console.log(`Created ${created.length} seed members around Bengaluru.`);

  const likeEmail = process.argv[process.argv.indexOf('--like') + 1];
  if (process.argv.includes('--like') && likeEmail) {
    const target = await db.query<{ user_id: string }>(
      "SELECT user_id FROM auth_identities WHERE provider = 'email' AND subject = $1",
      [likeEmail.toLowerCase()],
    );
    const targetId = target.rows[0]?.user_id;
    if (!targetId) {
      console.warn(`No account for ${likeEmail}; skipped likes.`);
    } else {
      const photo = await db.query<{ id: string }>(
        "SELECT id FROM profile_photos WHERE user_id = $1 AND status = 'approved' ORDER BY position LIMIT 1",
        [targetId],
      );
      const comments = [
        'Love this photo!',
        'Your smile 😊',
        null,
        'Coffee sometime?',
        null,
        'Great vibe',
      ];
      for (const [i, swiperId] of created.slice(0, 6).entries()) {
        await db.query(
          `INSERT INTO swipes (id, swiper_id, target_id, direction, item_type, item_id, comment, created_at)
           VALUES ($1, $2, $3, 'like', 'photo', $4, $5, now() - make_interval(mins => $6::int)) ON CONFLICT DO NOTHING`,
          [randomUUID(), swiperId, targetId, photo.rows[0]?.id, comments[i], i * 37],
        );
      }
      console.log(`6 seed members now like ${likeEmail}.`);
    }
  }
  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
