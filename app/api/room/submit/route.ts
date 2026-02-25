import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  handKey,
  nowMs,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  type RoomData,
} from "@/lib/room";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string; cardId?: string }
    | null;
  const roomId = body?.roomId?.toUpperCase().trim() ?? "";
  const cardId = body?.cardId ?? "";
  const playerToken = getBearerToken(request);

  if (!roomId || !cardId) {
    return NextResponse.json(
      { error: "Room ID and card are required." },
      { status: 400 },
    );
  }

  if (!playerToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  if (room.phase !== "SELECT") {
    return NextResponse.json(
      { error: "Submissions are closed." },
      { status: 409 },
    );
  }

  const playerId = await redis.hget<string>(tokensKey(roomId), playerToken);
  if (!playerId) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const handRaw = await redis.get<string>(handKey(roomId, playerId));
  const hand = safeJsonParse<{ cardIds: string[] }>(handRaw);
  if (!hand || !hand.cardIds.includes(cardId)) {
    return NextResponse.json(
      { error: "Card not in hand." },
      { status: 400 },
    );
  }

  const existing = await redis.hget<string>(submissionsKey(roomId), playerId);
  if (existing) {
    return NextResponse.json(
      { error: "Submission already received." },
      { status: 409 },
    );
  }

  await redis.hset(submissionsKey(roomId), {
    [playerId]: JSON.stringify({ cardId, submittedAt: nowMs() }),
  });
  await Promise.all([
    redis.expire(submissionsKey(roomId), TTL_SECONDS),
    redis.expire(roomKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}

