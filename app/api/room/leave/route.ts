import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  handKey,
  playersKey,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  votesKey,
  type RoomData,
} from "@/lib/room";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string }
    | null;
  const roomId = body?.roomId?.toUpperCase().trim() ?? "";
  const playerToken = getBearerToken(request);

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
  }
  if (!playerToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const playerId = await redis.hget<string>(tokensKey(roomId), playerToken);
  if (!playerId) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }
  if (playerId === room.hostId) {
    return NextResponse.json(
      { error: "Host cannot leave. Use room delete." },
      { status: 409 },
    );
  }

  await Promise.all([
    redis.hdel(playersKey(roomId), playerId),
    redis.hdel(tokensKey(roomId), playerToken),
    redis.hdel(submissionsKey(roomId), playerId),
    redis.hdel(votesKey(roomId), playerId),
    redis.del(handKey(roomId, playerId)),
  ]);

  return NextResponse.json({ ok: true });
}
