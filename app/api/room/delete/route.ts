import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  dealtRedKey,
  handKey,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  type PlayerData,
  type RoomData,
} from "@/lib/room";

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

  const playersRaw = (await redis.hgetall<string>(playersKey(roomId))) ?? {};
  const playerIds = Object.entries(playersRaw)
    .map(([playerId, value]) =>
      safeJsonParse<PlayerData>(value) ? playerId : null,
    )
    .filter((playerId): playerId is string => Boolean(playerId));

  const ops: Array<Promise<unknown>> = [
    redis.del(roomKey(roomId)),
    redis.del(playersKey(roomId)),
    redis.del(tokensKey(roomId)),
    redis.del(submissionsKey(roomId)),
    redis.del(dealtRedKey(roomId)),
  ];

  for (const playerId of playerIds) {
    ops.push(redis.del(handKey(roomId, playerId)));
  }

  await Promise.all(ops);

  return NextResponse.json({ ok: true });
}
