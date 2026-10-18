import * as bcrypt from 'bcryptjs';
import { and, eq, ne, sql } from 'drizzle-orm';
import { config } from '../../config';
import { db, type AccountRow } from '../../lib/db';
import { accounts, socials, videos as videosTable } from '../../lib/schema';
import { KEYS } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import { newRefreshToken, signAccessToken } from '../../lib/tokens';
import { badRequest, conflict, notFound, unauthorized } from '../../common/errors';

export interface AccountJson {
  id: number;
  username: string;
  avatar_url?: string;
  bio?: string;
}

export class AccountService {
  toAccountJson(row: AccountRow): AccountJson {
    const out: AccountJson = { id: row.id, username: row.username };
    if (row.avatar_url) out.avatar_url = row.avatar_url;
    if (row.bio) out.bio = row.bio;
    return out;
  }

  async findByID(id: number): Promise<AccountJson> {
    const rows = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!rows[0]) throw notFound('account not found');
    return this.toAccountJson(rows[0]);
  }

  async findByUsername(username: string): Promise<AccountJson> {
    const rows = await db.select().from(accounts).where(eq(accounts.username, username));
    if (!rows[0]) throw notFound('account not found');
    return this.toAccountJson(rows[0]);
  }

  async register(username: string, password: string): Promise<void> {
    const exists = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.username, username));
    if (exists.length > 0) throw conflict('username already taken');
    const hashed = await bcrypt.hash(password, 10);
    await db.insert(accounts).values({ username, password: hashed });
  }

  /** 登录成功写入 access + refresh token（DB + Redis），支持服务端撤销 */
  private async issueTokens(
    row: AccountRow,
  ): Promise<{ token: string; refresh_token: string; account_id: number; username: string }> {
    const token = signAccessToken({ account_id: row.id, username: row.username });
    const refreshToken = newRefreshToken();
    await db
      .update(accounts)
      .set({ token, refresh_token: refreshToken })
      .where(eq(accounts.id, row.id));
    const ttl = config.jwt.refreshTtlSec;
    await redisLib.set(KEYS.accountToken(row.id), token, 24 * 3600);
    await redisLib.set(KEYS.accountRefresh(row.id), refreshToken, ttl);
    await redisLib.set(KEYS.refreshToAccount(refreshToken), String(row.id), ttl);
    return { token, refresh_token: refreshToken, account_id: row.id, username: row.username };
  }

  async login(username: string, password: string) {
    const rows = await db.select().from(accounts).where(eq(accounts.username, username));
    const row = rows[0];
    if (!row) throw unauthorized('invalid username or password');
    const ok = await bcrypt.compare(password, row.password);
    if (!ok) throw unauthorized('invalid username or password');
    return this.issueTokens(row);
  }

  /** Refresh Token 换新 access token：优先 Redis，失败回源 MySQL */
  async refresh(refreshToken: string) {
    let accountId = Number((await redisLib.get(KEYS.refreshToAccount(refreshToken))) ?? 0);
    if (!accountId) {
      const rows = await db.select().from(accounts).where(eq(accounts.refresh_token, refreshToken));
      const row = rows[0];
      if (!row) throw unauthorized('invalid refresh token');
      accountId = row.id;
    }
    const rows = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const row = rows[0];
    if (!row || row.refresh_token !== refreshToken) throw unauthorized('invalid refresh token');

    const token = signAccessToken({ account_id: row.id, username: row.username });
    await db.update(accounts).set({ token }).where(eq(accounts.id, row.id));
    await redisLib.set(KEYS.accountToken(row.id), token, 24 * 3600);
    return { token, account_id: row.id, username: row.username };
  }

  /** 改密：验证旧密码，成功后清空双 token 强制下线 */
  async changePassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw badRequest('new password too short');
    const rows = await db.select().from(accounts).where(eq(accounts.username, username));
    const row = rows[0];
    if (!row) throw notFound('account not found');
    const ok = await bcrypt.compare(oldPassword, row.password);
    if (!ok) throw unauthorized('old password is incorrect');
    const hashed = await bcrypt.hash(newPassword, 10);
    await db
      .update(accounts)
      .set({ password: hashed, token: null, refresh_token: null })
      .where(eq(accounts.id, row.id));
    await this.clearTokens(row.id);
  }

  async logout(accountId: number): Promise<void> {
    await db
      .update(accounts)
      .set({ token: null, refresh_token: null })
      .where(eq(accounts.id, accountId));
    await this.clearTokens(accountId);
  }

  private async clearTokens(accountId: number): Promise<void> {
    await redisLib.del(KEYS.accountToken(accountId), KEYS.accountRefresh(accountId));
    // refresh:<token> 索引随会话失效（无法枚举删除，靠 TTL 过期）
  }

  /** 改名：更新用户名并签发新 JWT，旧 token 立即失效 */
  async rename(accountId: number, newUsername: string): Promise<string> {
    const exists = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.username, newUsername), ne(accounts.id, accountId)));
    if (exists.length > 0) throw conflict('username already taken');
    const rows = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const row = rows[0];
    if (!row) throw notFound('account not found');
    const token = signAccessToken({ account_id: row.id, username: newUsername });
    await db
      .update(accounts)
      .set({ username: newUsername, token })
      .where(eq(accounts.id, accountId));
    await redisLib.set(KEYS.accountToken(accountId), token, 24 * 3600);
    return token;
  }

  async updateProfile(accountId: number, avatarUrl: string, bio: string): Promise<void> {
    const set: Partial<typeof accounts.$inferInsert> = {};
    if (avatarUrl !== '') set.avatar_url = avatarUrl;
    if (bio !== '') set.bio = bio;
    if (Object.keys(set).length === 0) return;
    await db.update(accounts).set(set).where(eq(accounts.id, accountId));
  }

  async updateAvatar(accountId: number, avatarUrl: string): Promise<void> {
    await db.update(accounts).set({ avatar_url: avatarUrl }).where(eq(accounts.id, accountId));
  }

  /** 主页聚合统计：作品数 / 获赞总数 / 粉丝数 / 关注数 */
  async getProfile(accountId: number) {
    const account = await this.findByID(accountId);
    const [videoAgg] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(videosTable)
      .where(eq(videosTable.author_id, accountId));
    const [likesAgg] = await db
      .select({ s: sql<number>`COALESCE(SUM(${videosTable.likes_count}), 0)` })
      .from(videosTable)
      .where(eq(videosTable.author_id, accountId));
    const [followersAgg] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(socials)
      .where(eq(socials.vlogger_id, accountId));
    const [vloggersAgg] = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(socials)
      .where(eq(socials.follower_id, accountId));
    return {
      account,
      video_count: Number(videoAgg?.c ?? 0),
      total_likes: Number(likesAgg?.s ?? 0),
      follower_count: Number(followersAgg?.c ?? 0),
      vlogger_count: Number(vloggersAgg?.c ?? 0),
    };
  }
}
