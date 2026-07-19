import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ISLAND_ID,
  DEFAULT_SPAWN_ID,
  type SessionIdentity,
} from '@pirate-fruit/shared';
import {
  createCsrfToken,
  createRawSessionToken,
  csrfTokenMatches,
  hashSessionToken,
  isRawSessionToken,
} from './sessionCrypto.js';
import type { SessionRepository, StoredSessionRecord } from './sessionRepository.js';

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface AuthenticatedSession {
  record: StoredSessionRecord;
  identity: SessionIdentity;
  csrfToken: string;
}

export interface IssuedGuestSession extends AuthenticatedSession {
  rawToken: string;
}

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly secret: string,
    private readonly ttlDays: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** S18: ตั้งชื่อตัวละครแรกได้จากหน้า Landing — ไม่ส่งมา = ชื่อ Guest เดิม */
  async createGuest(characterName?: string): Promise<IssuedGuestSession> {
    const now = this.clock();
    const userId = randomUUID();
    const characterId = randomUUID();
    const rawToken = createRawSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const record = await this.repository.createGuest({
      userId,
      characterId,
      characterName: characterName ?? `Guest-${characterId.slice(0, 8)}`,
      sessionId: randomUUID(),
      tokenHash,
      expiresAt: new Date(now.getTime() + this.ttlDays * DAY_MS),
      currentIslandId: DEFAULT_ISLAND_ID,
      spawnId: DEFAULT_SPAWN_ID,
    });
    return { ...this.authentication(record), rawToken };
  }

  async authenticate(rawToken: unknown): Promise<AuthenticatedSession | null> {
    if (!isRawSessionToken(rawToken)) return null;
    const now = this.clock();
    const record = await this.repository.findActiveByTokenHash(
      hashSessionToken(rawToken),
      now,
    );
    if (!record) return null;
    await this.repository.touch(record.sessionId, now);
    return this.authentication(record);
  }

  validateCsrf(session: AuthenticatedSession, received: unknown): boolean {
    return csrfTokenMatches(session.csrfToken, received);
  }

  async revoke(session: AuthenticatedSession): Promise<boolean> {
    return this.repository.revoke(session.record.sessionId, this.clock());
  }

  activeCount(): Promise<number> {
    return this.repository.countActive(this.clock());
  }

  private authentication(record: StoredSessionRecord): AuthenticatedSession {
    return {
      record,
      identity: {
        userId: record.userId,
        characterId: record.characterId,
        characterName: record.characterName,
        expiresAt: record.expiresAt.toISOString(),
      },
      csrfToken: createCsrfToken(this.secret, record.sessionId, record.tokenHash),
    };
  }
}
