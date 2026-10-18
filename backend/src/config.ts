import * as fs from 'fs';
import * as path from 'path';

/** 读取 .env（进程环境变量优先），兼容根目录与 backend/ 目录下的 .env */
function loadDotEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
    break;
  }
}
loadDotEnv();

function str(key: string, def: string): string {
  const v = process.env[key];
  return v !== undefined && v.trim() !== '' ? v.trim() : def;
}

function int(key: string, def: number): number {
  const n = parseInt(str(key, String(def)), 10);
  return Number.isFinite(n) ? n : def;
}

export const config = {
  server: {
    port: int('SERVER_PORT', 8080),
  },
  jwt: {
    secret: str('JWT_SECRET', 'feedsystem-dev-secret-key'),
    accessTtlSec: int('JWT_ACCESS_TTL_SEC', 15 * 60),
    refreshTtlSec: int('JWT_REFRESH_TTL_SEC', 7 * 24 * 3600),
  },
  mysql: {
    host: str('MYSQL_HOST', '127.0.0.1'),
    port: int('MYSQL_PORT', 3307),
    user: str('MYSQL_USER', 'root'),
    password: str('MYSQL_PASSWORD', '123456'),
    database: str('MYSQL_DATABASE', 'feedsystem'),
  },
  redis: {
    host: str('REDIS_HOST', '127.0.0.1'),
    // compose 宿主机端口 6380（避免与本机已有 Redis 冲突），容器网络内用 REDIS_HOST=redis:6379
    port: int('REDIS_PORT', 6381),
    password: str('REDIS_PASSWORD', '123456'),
    db: int('REDIS_DB', 0),
  },
  rabbitmq: {
    host: str('RABBITMQ_HOST', '127.0.0.1'),
    port: int('RABBITMQ_PORT', 5672),
    user: str('RABBITMQ_USER', 'admin'),
    pass: str('RABBITMQ_PASS', 'password123'),
    get url(): string {
      return `amqp://${this.user}:${this.pass}@${this.host}:${this.port}`;
    },
  },
  /** 上传文件根目录：本地 .run/uploads，Docker 中为 volume */
  uploadDir: path.resolve(process.cwd(), str('UPLOAD_DIR', '.run/uploads')),
  /**
   * 关注流推拉结合：粉丝数 ≥ followerThreshold 的作者视为大V走拉模式（只写发件箱），
   * 其余普通作者发布时推送到粉丝收件箱（写扩散）。阈值可被 Redis config:fanout_threshold 覆盖。
   */
  fanout: {
    followerThreshold: int('FANOUT_FOLLOWER_THRESHOLD', 10000),
    inboxMaxLen: int('FANOUT_INBOX_MAX_LEN', 1000),
    outboxMaxLen: int('FANOUT_OUTBOX_MAX_LEN', 500),
    followerBatchSize: int('FANOUT_FOLLOWER_BATCH_SIZE', 500),
  },
};

export type AppConfig = typeof config;
