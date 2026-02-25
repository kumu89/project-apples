import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  nowMs,
  playersKey,
  roomKey,
  safeJsonParse,
  votesKey,
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

  if (room.phase !== "VOTING") {
    return NextResponse.json(
      { error: "Voting is not open." },
      { status: 409 },
    );
  }

  const players = await redis.hlen(playersKey(roomId));
  const votesRaw = (await redis.hgetall(votesKey(roomId))) ?? {};
  const votesCount = Object.keys(votesRaw).length;

  if (players === 0 || votesCount < players) {
    return NextResponse.json(
      { error: "Not all players voted." },
      { status: 409 },
    );
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "RESULT",
    updatedAt: nowMs(),
  };

  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await Promise.all([
    redis.expire(roomKey(roomId), TTL_SECONDS),
    redis.expire(votesKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}
