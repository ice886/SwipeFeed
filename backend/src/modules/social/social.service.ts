import { and, desc, eq, sql } from 'drizzle-orm';
import { db, type AccountRow } from '../../lib/db';
import { accounts, socials } from '../../lib/schema';
import { EX, mq } from '../../lib/mq';
import { KEYS } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import { badRequest } from '../../common/errors';
import { NotificationService } from '../notification/notification.service';
import { backfillInboxOnFollow, removeAuthorFromInbox } from '../../lib/fanout';

/**
 * 关注/取关：MQ 异步落库（social.events），失败降级直写；
 * 关注成功触发被关注者通知；关注关系变化失效关注流缓存，
 * 并维护关注流收件箱（关注回填作者近期作品 / 取关移除其条目）。
 */
export class SocialService {
  constructor(private readonly notificationService: NotificationService) {}

  private toAccount(row: AccountRow) {
    const out: { id: number; username: string; avatar_url?: string; bio?: string } = {
      id: row.id,
      username: row.username,
    };
    if (row.avatar_url) out.avatar_url = row.avatar_url;
    if (row.bio) out.bio = row.bio;
    return out;
  }

  async follow(followerId: number, followerName: string, vloggerId: number): Promise<void> {
    if (followerId === vloggerId) throw badRequest('cannot follow yourself');
    const vloggers = await db.select().from(accounts).where(eq(accounts.id, vloggerId));
    if (!vloggers[0]) throw badRequest('account not found');

    const eventOk = await mq.publish(EX.social, 'social.follow', {
      follower_id: followerId,
      follower_name: followerName,
      vlogger_id: vloggerId,
      ts: Date.now(),
    });
    if (!eventOk) {
      // ON DUPLICATE 自赋值 = INSERT IGNORE 语义，重复关注不重复计数
      const [res] = await db
        .insert(socials)
        .values({ follower_id: followerId, vlogger_id: vloggerId })
        .onDuplicateKeyUpdate({ set: { follower_id: sql`${socials.follower_id}` } });
      if (res.affectedRows > 0) {
        await this.notificationService.notify(
          vloggerId,
          followerId,
          'follow',
          followerId,
          `${followerName} followed you`,
        );
      }
    }
    await redisLib.delByPattern(KEYS.feedListFollowingPattern(followerId));
    await backfillInboxOnFollow(followerId, vloggerId);
  }

  async unfollow(followerId: number, vloggerId: number): Promise<void> {
    const eventOk = await mq.publish(EX.social, 'social.unfollow', {
      follower_id: followerId,
      vlogger_id: vloggerId,
      ts: Date.now(),
    });
    if (!eventOk) {
      await db
        .delete(socials)
        .where(and(eq(socials.follower_id, followerId), eq(socials.vlogger_id, vloggerId)));
    }
    await redisLib.delByPattern(KEYS.feedListFollowingPattern(followerId));
    await removeAuthorFromInbox(followerId, vloggerId);
  }

  async getAllFollowers(vloggerId: number) {
    const rows = await db
      .select()
      .from(socials)
      .innerJoin(accounts, eq(accounts.id, socials.follower_id))
      .where(eq(socials.vlogger_id, vloggerId))
      .orderBy(desc(socials.id))
      .limit(500);
    return {
      followers: rows.map((r) => this.toAccount(r.accounts)),
      follower_count: rows.length,
    };
  }

  async getAllVloggers(followerId: number) {
    const rows = await db
      .select()
      .from(socials)
      .innerJoin(accounts, eq(accounts.id, socials.vlogger_id))
      .where(eq(socials.follower_id, followerId))
      .orderBy(desc(socials.id))
      .limit(500);
    return {
      vloggers: rows.map((r) => this.toAccount(r.accounts)),
      vlogger_count: rows.length,
    };
  }

  async getCounts(accountId: number) {
    const [followers] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(socials)
      .where(eq(socials.vlogger_id, accountId));
    const [vloggers] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(socials)
      .where(eq(socials.follower_id, accountId));
    return {
      follower_count: Number(followers?.c ?? 0),
      vlogger_count: Number(vloggers?.c ?? 0),
    };
  }
}
