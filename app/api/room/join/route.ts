import { NextResponse } from "next/server";
import { redCards } from "@/data/cards";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  createToken,
  dealtRedKey,
  handKey,
  normalizeName,
  normalizeRoomId,
  nowMs,
  playersKey,
  roomKey,
  safeJsonParse,
  tokensKey,
  type RoomData,
} from "@/lib/room";
import { DEFAULT_PROFILE } from "@/lib/profile";

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
    | { roomId?: string; name?: string; icon?: string }
    | null;
  const roomId = normalizeRoomId(body?.roomId ?? "");
  const name = normalizeName(body?.name ?? "");
  const icon = body?.icon ?? DEFAULT_PROFILE.icon;

  if (!roomId || roomId.length !== 5 || !name) {
    return NextResponse.json(
      { error: "5桁のルームIDと名前は必須です。" },
      { status: 400 },
    );
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json(
      { error: "ルームが見つかりません。" },
      { status: 404 },
    );
  }
  if (room.phase !== "WAITING") {
    return NextResponse.json(
      { error: "このルームは参加受付中ではありません。" },
      { status: 409 },
    );
  }

  const playerToken = createToken();
  const playerId = createToken();
  const timestamp = nowMs();

  const usedRaw = await redis.smembers(dealtRedKey(roomId));
  const used = new Set(usedRaw ?? []);
  const hand = pickHand(used);

  await redis.hset(playersKey(roomId), {
    [playerId]: JSON.stringify({
      id: playerId,
      name,
      icon,
      joinedAt: timestamp,
      score: 0,
    }),
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

