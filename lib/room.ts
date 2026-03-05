import { randomUUID } from "crypto";

export type RoomPhase = "WAITING" | "SELECT" | "VOTING" | "RESULT";

export type RoomData = {
  roomId: string;
  hostId: string;
  hostToken: string;
  phase: RoomPhase;
  promptCardId: string | null;
  createdAt: number;
  updatedAt: number;
  round: number;
};

export type PlayerData = {
  id: string;
  name: string;
  icon: string;
  joinedAt: number;
  score: number;
};

export type SubmissionData = {
  cardId: string;
  submittedAt: number;
};

export const TTL_SECONDS = 60 * 60 * 24;

export const roomKey = (roomId: string) => `room:${roomId}`;
export const playersKey = (roomId: string) => `room:${roomId}:players`;
export const tokensKey = (roomId: string) => `room:${roomId}:tokens`;
export const submissionsKey = (roomId: string) => `room:${roomId}:submissions`;
export const votesKey = (roomId: string) => `room:${roomId}:votes`;
export const handKey = (roomId: string, playerId: string) =>
  `room:${roomId}:hands:${playerId}`;
export const dealtRedKey = (roomId: string) => `room:${roomId}:dealtRed`;

export const nowMs = () => Date.now();

export function createRoomId(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

export function createToken(): string {
  return randomUUID().replace(/-/g, "");
}

export function safeJsonParse<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    return typeof value === "object" ? (value as T) : null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function normalizeName(raw: string): string {
  return raw.trim().slice(0, 24);
}

export function normalizeRoomId(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 5);
}

