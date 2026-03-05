import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  createRoomId,
  createToken,
  dealtRedKey,
  handKey,
  nowMs,
  normalizeName,
  playersKey,
  roomKey,
  tokensKey,
} from "@/lib/room";
import { DEFAULT_PROFILE } from "@/lib/profile";
import { redCards } from "@/data/cards";

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
    | { name?: string; icon?: string }
    | null;
  const name = normalizeName(body?.name ?? "");
  const icon = body?.icon ?? DEFAULT_PROFILE.icon;
  if (!name) {
    return NextResponse.json(
      { error: "名前を入力してください。" },
      { status: 400 },
    );
  }

  let roomId = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = createRoomId();
    const exists = await redis.get(roomKey(candidate));
    if (!exists) {
      roomId = candidate;
      break;
    }
  }

  if (!roomId) {
    return NextResponse.json(
      { error: "ルーム作成に失敗しました。" },
      { status: 500 },
    );
  }

  const hostToken = createToken();
  const playerToken = createToken();
  const playerId = createToken();
  const timestamp = nowMs();

  const room = {
    roomId,
    hostId: playerId,
    hostToken,
    phase: "WAITING",
    promptCardId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    round: 0,
  };

  const used = new Set<string>();
  const initialHand = pickHand(used);

  await redis.set(roomKey(roomId), JSON.stringify(room));
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
  await redis.set(
    handKey(roomId, playerId),
    JSON.stringify({ cardIds: initialHand }),
  );
  await redis.sadd(dealtRedKey(roomId), initialHand);

  await Promise.all([
    redis.expire(roomKey(roomId), TTL_SECONDS),
    redis.expire(playersKey(roomId), TTL_SECONDS),
    redis.expire(tokensKey(roomId), TTL_SECONDS),
    redis.expire(handKey(roomId, playerId), TTL_SECONDS),
    redis.expire(dealtRedKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ roomId, hostToken, playerToken });
}

