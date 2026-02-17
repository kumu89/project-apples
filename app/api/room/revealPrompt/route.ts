import { NextResponse } from "next/server";
import { greenCards } from "@/data/cards";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  nowMs,
  roomKey,
  safeJsonParse,
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

  const nextPrompt =
    greenCards[Math.floor(Math.random() * greenCards.length)];
  if (!nextPrompt) {
    return NextResponse.json(
      { error: "No prompt cards available." },
      { status: 500 },
    );
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "PROMPT",
    promptCardId: nextPrompt.id,
    updatedAt: nowMs(),
  };

  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await redis.expire(roomKey(roomId), TTL_SECONDS);

  return NextResponse.json({ promptCard: { text: nextPrompt.text } });
}

