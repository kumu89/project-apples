import { NextResponse } from "next/server";
import { redCards } from "@/data/cards";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  dealtRedKey,
  handKey,
  nowMs,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  type PlayerData,
  type RoomData,
} from "@/lib/room";

const HAND_SIZE = 8;

function dealHands(playerIds: string[]): Map<string, string[]> | null {
  const deck = [...redCards.map((card) => card.id)];
  const hands = new Map<string, string[]>();

  for (const playerId of playerIds) {
    const hand: string[] = [];
    for (let count = 0; count < HAND_SIZE; count += 1) {
      if (deck.length === 0) return null;
      const index = Math.floor(Math.random() * deck.length);
      const [cardId] = deck.splice(index, 1);
      if (cardId) hand.push(cardId);
    }
    hands.set(playerId, hand);
  }

  return hands;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string }
    | null;
  const roomId = body?.roomId?.toUpperCase().trim() ?? "";
  const hostToken = getBearerToken(request);

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
  }
  if (!hostToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }
  if (room.hostToken !== hostToken) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playersRaw = (await redis.hgetall(playersKey(roomId))) ?? {};
  const playerIds = Object.entries(playersRaw)
    .map(([playerId, value]) =>
      safeJsonParse<PlayerData>(value) ? playerId : null,
    )
    .filter((playerId): playerId is string => Boolean(playerId));

  const hands = dealHands(playerIds);
  if (!hands) {
    return NextResponse.json(
      { error: "No cards available." },
      { status: 409 },
    );
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "WAITING",
    promptCardId: null,
    updatedAt: nowMs(),
    round: 1,
  };

  const ops: Array<Promise<unknown>> = [];
  ops.push(redis.del(submissionsKey(roomId)));
  ops.push(redis.del(dealtRedKey(roomId)));
  for (const [playerId, cardIds] of hands.entries()) {
    ops.push(
      redis.set(
        handKey(roomId, playerId),
        JSON.stringify({ cardIds }),
      ),
    );
    ops.push(redis.expire(handKey(roomId, playerId), TTL_SECONDS));
    ops.push(redis.sadd(dealtRedKey(roomId), cardIds));
  }
  ops.push(redis.set(roomKey(roomId), JSON.stringify(updatedRoom)));
  ops.push(redis.expire(roomKey(roomId), TTL_SECONDS));
  ops.push(redis.expire(playersKey(roomId), TTL_SECONDS));
  ops.push(redis.expire(submissionsKey(roomId), TTL_SECONDS));
  ops.push(redis.expire(dealtRedKey(roomId), TTL_SECONDS));

  await Promise.all(ops);

  return NextResponse.json({ ok: true });
}
