import { NextResponse } from "next/server";
import { getRedCard } from "@/data/cards";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  handKey,
  normalizeRoomId,
  roomKey,
  safeJsonParse,
  tokensKey,
  type RoomData,
} from "@/lib/room";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = normalizeRoomId(searchParams.get("roomId") ?? "");
  const token = getBearerToken(request);

  if (!roomId || roomId.length !== 5) {
    return NextResponse.json(
      { error: "5桁のルームIDが必要です。" },
      { status: 400 },
    );
  }

  if (!token) {
    return NextResponse.json({ error: "認証に失敗しました。" }, { status: 401 });
  }

  const roomRaw = await redis.get<string>(roomKey(roomId));
  const room = safeJsonParse<RoomData>(roomRaw);
  if (!room) {
    return NextResponse.json(
      { error: "ルームが見つかりません。" },
      { status: 404 },
    );
  }

  const playerId = await redis.hget<string>(tokensKey(roomId), token);
  if (!playerId) {
    return NextResponse.json({ error: "トークンが無効です。" }, { status: 403 });
  }

  const handRaw = await redis.get<string>(handKey(roomId, playerId));
  const hand = safeJsonParse<{ cardIds: string[] }>(handRaw);
  if (!hand) {
    return NextResponse.json({ error: "手札が見つかりません。" }, { status: 404 });
  }

  const cards = hand.cardIds
    .map((id) => getRedCard(id))
    .filter((card): card is { id: string; text: string } => Boolean(card));

  return NextResponse.json({ playerId, cards });
}

