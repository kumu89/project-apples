import { NextResponse } from "next/server";
import { getRedCard } from "@/data/cards";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  handKey,
  roomKey,
  safeJsonParse,
  tokensKey,
  type RoomData,
} from "@/lib/room";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.toUpperCase().trim() ?? "";
  const token = getBearerToken(request);

  if (!roomId) {
    return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const playerId = await redis.hget<string>(tokensKey(roomId), token);
  if (!playerId) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const handRaw = await redis.get<string>(handKey(roomId, playerId));
  const hand = safeJsonParse<{ cardIds: string[] }>(handRaw);
  if (!hand) {
    return NextResponse.json({ error: "Hand not found." }, { status: 404 });
  }

  const cards = hand.cardIds
    .map((id) => getRedCard(id))
    .filter((card): card is { id: string; text: string } => Boolean(card));

  return NextResponse.json({ playerId, cards });
}

