export interface SessionIdentity {
  userId: string;
  characterId: string;
  characterName: string;
  expiresAt: string;
}

export interface SessionResponse {
  ok: true;
  created: boolean;
  session: SessionIdentity;
  csrfToken: string;
}

export interface SessionLogoutResponse {
  ok: true;
}
