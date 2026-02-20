import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  nowMs,
  roomKey,
  safeJsonParse,
  submissionsKey,
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

  if (room.phase !== "REVEALED") {
    return NextResponse.json(
      { error: "Round is not finished yet." },
      { status: 409 },
    );
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "WAITING",
    promptCardId: null,
    updatedAt: nowMs(),
    round: room.round + 1,
  };

  await redis.del(submissionsKey(roomId));
  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await Promise.all([
    redis.expire(roomKey(roomId), TTL_SECONDS),
    redis.expire(submissionsKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}

