import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/auth";
import { redis } from "@/lib/redis";
import {
  TTL_SECONDS,
  nowMs,
  normalizeRoomId,
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
  const roomId = normalizeRoomId(body?.roomId ?? "");
  const hostToken = getBearerToken(request);

  if (!roomId || roomId.length !== 5) {
    return NextResponse.json(
      { error: "5桁のルームIDが必要です。" },
      { status: 400 },
    );
  }

  if (!hostToken) {
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

  if (room.hostToken !== hostToken) {
    return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
  }

  if (room.phase !== "VOTING") {
    return NextResponse.json(
      { error: "投票は開始されていません。" },
      { status: 409 },
    );
  }

  const players = await redis.hlen(playersKey(roomId));
  const votesRaw = (await redis.hgetall(votesKey(roomId))) ?? {};
  const votesCount = Object.keys(votesRaw).length;

  if (players === 0 || votesCount < players) {
    return NextResponse.json(
      { error: "まだ全員が投票していません。" },
      { status: 409 },
    );
  }

  const playersRaw = (await redis.hgetall(playersKey(roomId))) ?? {};
  const playerMap = new Map(
    Object.entries(playersRaw)
      .map(([playerId, value]) => {
        const player = safeJsonParse<{ score: number } & Record<string, unknown>>(
          value,
        );
        return player ? [playerId, player] : null;
      })
      .filter((entry): entry is [string, { score: number } & Record<string, unknown>] =>
        Boolean(entry),
      ),
  );

  const voteCounts = new Map<string, number>();
  for (const value of Object.values(votesRaw)) {
    const vote = safeJsonParse<{ targetPlayerId: string }>(value);
    const targetId = vote?.targetPlayerId;
    if (!targetId || !playerMap.has(targetId)) continue;
    voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
  }

  const maxVotes =
    voteCounts.size > 0 ? Math.max(...Array.from(voteCounts.values())) : 0;
  const winners = Array.from(voteCounts.entries())
    .filter(([, count]) => count === maxVotes)
    .map(([playerId]) => playerId);
  const scoreDelta = winners.length > 1 ? 1 : 3;

  const scoreOps: Array<Promise<unknown>> = [];
  if (maxVotes > 0) {
    for (const playerId of winners) {
      const player = playerMap.get(playerId);
      if (!player) continue;
      scoreOps.push(
        redis.hset(playersKey(roomId), {
          [playerId]: JSON.stringify({
            ...player,
            score: (player.score ?? 0) + scoreDelta,
          }),
        }),
      );
    }
  }

  const updatedRoom: RoomData = {
    ...room,
    phase: "RESULT",
    updatedAt: nowMs(),
  };

  await redis.set(roomKey(roomId), JSON.stringify(updatedRoom));
  await Promise.all([
    ...scoreOps,
    redis.expire(roomKey(roomId), TTL_SECONDS),
    redis.expire(playersKey(roomId), TTL_SECONDS),
    redis.expire(votesKey(roomId), TTL_SECONDS),
  ]);

  return NextResponse.json({ ok: true });
}
