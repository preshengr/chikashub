import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

jest.setTimeout(30_000);

const VALID_REGISTER = {
  parent: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    relationship: 'mother',
    email: 'ada@example.com',
    phone: '555 123 4567',
  },
  child: { firstName: 'Chika', age: 7, grade: 'grade_1' },
  preferences: {
    learningGoals: ['math', 'coding'],
    readingLevel: 'early_reader',
    gameplayStyle: 'story',
  },
  consent: {
    consentData: true,
    termsConsent: true,
    signatureFullName: 'Ada Lovelace',
    signatureDate: '2026-10-01',
  },
};

interface Envelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Array<{ field: string; message: string }> };
}

describe('Chika\'s Game Hub API (integration)', () => {
  let app: INestApplication;
  let http: any;
  let username: string;
  let token: string;

  beforeAll(async () => {
    process.env.DATA_STORE = 'memory';
    process.env.RL_AUTH_MAX = '10000';
    process.env.RL_EVENT_MAX = '10000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.DATA_STORE;
    delete process.env.RL_AUTH_MAX;
    delete process.env.RL_EVENT_MAX;
  });

  describe('GET /api/games (public catalogue)', () => {
    it('returns the full catalogue inside the response envelope', async () => {
      const res = await request(http).get('/api/games').expect(200);
      const body = res.body as Envelope<{ games: unknown[]; count: number }>;
      expect(body.success).toBe(true);
      expect(body.data?.count).toBeGreaterThanOrEqual(10);
      expect(body.data?.games).toHaveLength(body.data!.count);
    });
  });

  describe('POST /api/auth/register - validation', () => {
    it('rejects a malformed payload with field-level details', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({ ...VALID_REGISTER, parent: { ...VALID_REGISTER.parent, email: 'nope' } })
        .expect(400);

      const body = res.body as Envelope;
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.some((d) => d.field === 'parent.email')).toBe(true);
    });

    it('rejects an age outside 4-12', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({ ...VALID_REGISTER, child: { ...VALID_REGISTER.child, age: 15 } })
        .expect(400);
      const body = res.body as Envelope;
      expect(body.error?.message).toBe('Age must be between 4 and 12');
    });

    it('rejects more than two learning goals', async () => {
      await request(http)
        .post('/api/auth/register')
        .send({
          ...VALID_REGISTER,
          preferences: { ...VALID_REGISTER.preferences, learningGoals: ['math', 'reading', 'science'] },
        })
        .expect(400);
    });

    it('rejects unticked consent boxes', async () => {
      const res = await request(http)
        .post('/api/auth/register')
        .send({
          ...VALID_REGISTER,
          consent: { ...VALID_REGISTER.consent, consentData: false, termsConsent: false },
        })
        .expect(400);
      expect((res.body as Envelope).error?.details?.some((d) => d.field === 'consent.consentData')).toBe(true);
    });

    it('rejects a completely empty body', async () => {
      const res = await request(http).post('/api/auth/register').send({}).expect(400);
      expect((res.body as Envelope).error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('registration lifecycle', () => {
    it('stages a profile and returns a generated username', async () => {
      const res = await request(http).post('/api/auth/register').send(VALID_REGISTER).expect(201);
      const body = res.body as Envelope<{ username: string; childFirstName: string; expiresInMinutes: number }>;
      username = body.data!.username;
      expect(username).toMatch(/^[a-z]{3}\d{5}$/);
      expect(body.data?.childFirstName).toBe('Chika');
      expect(body.data?.expiresInMinutes).toBeGreaterThan(0);
    });

    it('does not allow dashboard access before confirmation', async () => {
      const res = await request(http)
        .get('/api/dashboard')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
      expect((res.body as Envelope).error?.code).toBe('INVALID_TOKEN');
    });

    it('activates the account and issues a session token on Accept', async () => {
      const res = await request(http)
        .post('/api/auth/register/confirm')
        .send({ username, accept: true })
        .expect(201);
      const body = res.body as Envelope<{ token: string; profile: { status: string } }>;
      token = body.data!.token;
      expect(token.length).toBeGreaterThan(20);
      expect(body.data?.profile.status).toBe('active');
    });
  });

  describe('POST /api/auth/login', () => {
    it('rejects an unknown username with the exact product message', async () => {
      const res = await request(http).post('/api/auth/login').send({ username: 'zzz99999' }).expect(404);
      const body = res.body as Envelope;
      expect(body.error?.code).toBe('USER_NOT_FOUND');
      expect(body.error?.message).toBe('User Does Not Exist - Try Again');
    });

    it('rejects a malformed username', async () => {
      const res = await request(http).post('/api/auth/login').send({ username: 'nope' }).expect(404);
      expect((res.body as Envelope).error?.message).toBe('User Does Not Exist - Try Again');
    });

    it('authenticates the generated username', async () => {
      const res = await request(http).post('/api/auth/login').send({ username }).expect(201);
      const body = res.body as Envelope<{ token: string; profile: { child: { firstName: string } } }>;
      expect(body.data?.profile.child.firstName).toBe('Chika');
      expect(body.data?.token.length).toBeGreaterThan(20);
    });

    it('requires a username field', async () => {
      const res = await request(http).post('/api/auth/login').send({}).expect(400);
      expect((res.body as Envelope).error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/dashboard', () => {
    it('requires a session token', async () => {
      await request(http).get('/api/dashboard').expect(401);
    });

    it('returns profile, team badge and goal-grouped games', async () => {
      const res = await request(http)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = res.body as Envelope<{
        username: string;
        team: string;
        teamLabel: string;
        child: { age: number; learningGoals: string[] };
        games: Array<{ id: string; progress: unknown }>;
        sections: Array<{ goal: string; label: string; games: unknown[] }>;
        serverTime: string;
      }>;

      expect(body.data?.username).toBe(username);
      expect(body.data?.team).toBe('mid_age');
      expect(body.data?.teamLabel).toBe('Mid Age Team');
      expect(body.data?.child.age).toBe(7);
      expect(body.data?.games.length).toBeGreaterThan(0);
      expect(body.data?.sections.length).toBeGreaterThan(0);
      expect(body.data?.sections[0].goal).toBe('math');
      expect(body.data?.serverTime).not.toBe('');
      expect(new Date(body.data!.serverTime).getTime()).not.toBeNaN();

      const textHeavy = body.data!.games.filter((g) => (g as unknown as { readingLevel: string }).readingLevel === 'independent_reader');
      expect(textHeavy).toHaveLength(0);
    });

    it('every dashboard game carries a progress slot', async () => {
      const res = await request(http)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = res.body as Envelope<{ games: Array<{ id: string; progress: unknown }> }>;
      for (const game of body.data!.games) {
        expect(game).toHaveProperty('progress');
        expect(game).toHaveProperty('instructions');
      }
    });
  });

  describe('gameplay telemetry', () => {
    it('rejects events without a session', async () => {
      await request(http)
        .post('/api/game/event')
        .send({ gameId: 'number-ninja', eventType: 'start' })
        .expect(401);
    });

    it('accepts a sequence of gameplay events', async () => {
      const events = [
        { gameId: 'number-ninja', eventType: 'start', level: 0, score: 0 },
        { gameId: 'number-ninja', eventType: 'level_complete', level: 5, score: 500 },
        { gameId: 'number-ninja', eventType: 'failure', level: 5, score: 500 },
        { gameId: 'number-ninja', eventType: 'game_complete', level: 10, score: 1500 },
      ];
      for (const event of events) {
        const res = await request(http)
          .post('/api/game/event')
          .set('Authorization', `Bearer ${token}`)
          .send(event)
          .expect(201);
        expect((res.body as Envelope<{ accepted: boolean }>).data?.accepted).toBe(true);
      }
    });

    it('rejects an unknown game id', async () => {
      const res = await request(http)
        .post('/api/game/event')
        .set('Authorization', `Bearer ${token}`)
        .send({ gameId: 'puzzle-bogus', eventType: 'start' })
        .expect(400);
      expect((res.body as Envelope).error?.code).toBe('UNKNOWN_GAME');
    });

    it('rejects an unknown event type', async () => {
      const res = await request(http)
        .post('/api/game/event')
        .set('Authorization', `Bearer ${token}`)
        .send({ gameId: 'number-ninja', eventType: 'explode' })
        .expect(400);
      expect((res.body as Envelope).error?.code).toBe('VALIDATION_ERROR');
    });

    it('reports progress for the played game', async () => {
      const res = await request(http)
        .get('/api/game/progress?gameId=number-ninja')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = res.body as Envelope<{
        byGame: Array<{ gameId: string; maxLevel: number; failures: number; completed: boolean; percent: number }>;
      }>;
      expect(body.data?.byGame).toHaveLength(1);
      const [row] = body.data!.byGame;
      expect(row.gameId).toBe('number-ninja');
      expect(row.maxLevel).toBe(10);
      expect(row.failures).toBe(1);
      expect(row.completed).toBe(true);
      expect(row.percent).toBe(100);
    });

    it('aggregates progress in the dashboard payload', async () => {
      const res = await request(http)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = res.body as Envelope<{
        games: Array<{ id: string; progress: { percent: number } | null }>;
        progress: { overall: { percent: number; gamesCompleted: number } };
      }>;
      expect(body.data?.progress.overall.gamesCompleted).toBe(1);
      const ninja = body.data!.games.find((g) => g.id === 'number-ninja');
      expect(ninja?.progress?.percent).toBe(100);
    });

    it('supports the public game detail lookup used by instruction modals', async () => {
      const res = await request(http).get('/api/game/detail?gameId=color-castle').expect(200);
      expect((res.body as Envelope<{ instructions: string[] }>).data?.instructions.length).toBeGreaterThan(0);
      await request(http).get('/api/game/detail?gameId=missing').expect(404);
    });
  });

  describe('session lifecycle', () => {
    it('revokes the token on logout', async () => {
      await request(http).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
      const res = await request(http)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect((res.body as Envelope).error?.code).toBe('INVALID_TOKEN');
    });

    it('issues a fresh token on login after logout', async () => {
      const res = await request(http).post('/api/auth/login').send({ username }).expect(201);
      token = (res.body as Envelope<{ token: string }>).data!.token;
      await request(http).get('/api/dashboard').set('Authorization', `Bearer ${token}`).expect(200);
    });

    it('never deletes an active account through the deny endpoint', async () => {
      await request(http).post('/api/auth/register/deny').send({ username }).expect(200);
      const res = await request(http).post('/api/auth/login').send({ username }).expect(201);
      expect((res.body as Envelope<{ token: string }>).data?.token).toBeTruthy();
    });

    it('exposes the profile for the signed-in child', async () => {
      const res = await request(http).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
      const body = res.body as Envelope<{ username: string; status: string }>;
      expect(body.data?.username).toBe(username);
      expect(body.data?.status).toBe('active');
    });
  });
});

describe('rate limiting (isolated app)', () => {
  let app: INestApplication;
  let http: any;

  beforeAll(async () => {
    process.env.DATA_STORE = 'memory';
    process.env.RL_AUTH_MAX = '2';
    process.env.RL_WINDOW_MS = '60000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.RL_AUTH_MAX;
    delete process.env.RL_WINDOW_MS;
    delete process.env.DATA_STORE;
  });

  it('answers 429 once the auth window is exhausted', async () => {
    await request(http).post('/api/auth/login').send({ username: 'aaa11111' }).expect(404);
    await request(http).post('/api/auth/login').send({ username: 'aaa11111' }).expect(404);

    const res = await request(http).post('/api/auth/login').send({ username: 'aaa11111' }).expect(429);
    const body = res.body as Envelope;
    expect(body.error?.code).toBe('RATE_LIMITED');
    expect(body.error?.message).toContain('Too many requests');
  });

  it('does not rate limit the public catalogue', async () => {
    for (let i = 0; i < 5; i++) {
      await request(http).get('/api/games').expect(200);
    }
  });
});
