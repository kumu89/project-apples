import { NextResponse } from "next/server";
import { redCards } from "@/data/cards";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  createToken,
  dealtRedKey,
  handKey,
  normalizeName,
  nowMs,
  playersKey,
  roomKey,
  safeJsonParse,
  tokensKey,
} from "@/lib/room";

const HAND_SIZE = 8;

function pickHand(used: Set<string>): string[] {
  const available = redCards.filter((card) => !used.has(card.id));
  const picks: string[] = [];
  while (picks.length < HAND_SIZE) {
    if (available.length === 0) {
      const fallback =
        redCards[Math.floor(Math.random() * redCards.length)]?.id;
      if (fallback) picks.push(fallback);
    } else {
      const index = Math.floor(Math.random() * available.length);
      const [card] = available.splice(index, 1);
      if (card) picks.push(card.id);
    }
  }
  return picks;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string; name?: string }
    | null;
  const roomId = body?.roomId?.toUpperCase().trim() ?? "";
  const name = normalizeName(body?.name ?? "");

  if (!roomId || !name) {
    return NextResponse.json(
      { error: "Room ID and name are required." },
      { status: 400 },
    );
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<{ roomId: string }>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const playerToken = createToken();
  const playerId = createToken();
  const timestamp = nowMs();

  const usedRaw = await redis.smembers<string>(dealtRedKey(roomId));
  const used = new Set(usedRaw ?? []);
  const hand = pickHand(used);

  await redis.hset(playersKey(roomId), {
    [playerId]: JSON.stringify({ id: playerId, name, joinedAt: timestamp }),
  });
  await redis.hset(tokensKey(roomId), {
    [playerToken]: playerId,
  });
  await redis.set(handKey(roomId, playerId), JSON.stringify({ cardIds: hand }));
  await redis.sadd(dealtRedKey(roomId), hand);

  await Promise.all([
    redis.expire(roomKey(roomId), TTL_SECONDS),
    redis.expire(playersKey(roomId), TTL_SECONDS),
    redis.expire(tokensKey(roomId), TTL_SECONDS),
    redis.expire(handKey(roomId, playerId), TTL_SECONDS),
    redis.expire(dealtRedKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ playerToken });
}

