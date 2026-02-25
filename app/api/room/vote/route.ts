import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  roomKey,
  safeJsonParse,
  submissionsKey,
  tokensKey,
  votesKey,
  type RoomData,
} from "@/lib/room";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { roomId?: string; targetPlayerId?: string }
    | null;
  const roomId = body?.roomId?.toUpperCase().trim() ?? "";
  const targetPlayerId = body?.targetPlayerId ?? "";
  const playerToken = getBearerToken(request);

  if (!roomId || !targetPlayerId) {
    return NextResponse.json(
      { error: "Room ID and target are required." },
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

  if (room.phase !== "VOTING") {
    return NextResponse.json({ error: "Voting is closed." }, { status: 409 });
  }

  const voterId = await redis.hget<string>(tokensKey(roomId), playerToken);
  if (!voterId) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }
  if (voterId === targetPlayerId) {
    return NextResponse.json(
      { error: "Cannot vote for yourself." },
      { status: 409 },
    );
  }

  const targetSubmission = await redis.hget<string>(
    submissionsKey(roomId),
    targetPlayerId,
  );
  if (!targetSubmission) {
    return NextResponse.json(
      { error: "Target has no submission." },
      { status: 409 },
    );
  }

  const existingVote = await redis.hget<string>(votesKey(roomId), voterId);
  if (existingVote) {
    return NextResponse.json(
      { error: "Vote already submitted." },
      { status: 409 },
    );
  }

  await redis.hset(votesKey(roomId), {
    [voterId]: JSON.stringify({ targetPlayerId }),
  });
  await Promise.all([
    redis.expire(votesKey(roomId), TTL_SECONDS),
    redis.expire(roomKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}
