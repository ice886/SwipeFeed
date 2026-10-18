# SwipeFeed

短视频 Feed 流系统的 **Node.js（TypeScript）+ React** 实现：账号、视频（分片上传/断点续传）、点赞、评论、关注、Feed 流（冷热分离）、私信、通知（SSE 实时推送），配套 RabbitMQ 异步 Worker、Redis 缓存/热榜与 Docker Compose 部署。


## 功能

| 模块 | 功能                                                                            |
| ---- | ------------------------------------------------------------------------------- |
| 账号 | 注册、登录、Refresh Token、改名、改密、登出、头像上传、个人简介、主页统计       |
| 视频 | 普通上传、5MB 分片上传、断点续传、封面上传、发布、作者作品、详情缓存、#话题标签 |
| 点赞 | 点赞、取消点赞、是否已赞、已赞列表、RabbitMQ 异步落库、热度更新、SSE 通知       |
| 评论 | 发布、删除、列表、@username 提及通知、RabbitMQ 异步落库、热度更新               |
| 关注 | 关注、取关、粉丝列表、关注列表、粉丝/关注计数、SSE 通知                         |
| Feed | 推荐流、关注流（推拉结合）、点赞榜、热榜、话题流、冷热分离、游标分页、短视频沉浸播放 |
| 私信 | 发送私信、按对端用户查看最近 50 条会话                                          |
| 通知 | 点赞/评论/关注/提及通知、SSE 实时推送、通知列表、未读计数、已读标记             |
| 工程 | Docker Compose、`start.sh`、API/Worker 双进程、限流、健康检查                 |

## 技术栈

| 维度 | 组件                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 后端 | Node.js 22 + TypeScript + Express 5（Router/Service 分层，中间件鉴权/限流）                                               |
| 数据 | MySQL 8（Drizzle ORM + mysql2 驱动 + 启动 AutoMigrate）、Redis 7（ioredis，可选降级）                                    |
| 消息 | RabbitMQ 3（amqplib Topic Exchange + DLX，发布失败降级直写）                                                               |
| 异步 | Worker 双进程：API 进程内 OutboxPoller/TimelineConsumer/NotificationWorker；独立进程 Like/Comment/Social/Popularity/Fanout Worker |
| 前端 | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + react-router-dom 7                                                       |
| 部署 | Docker Compose（mysql/redis/rabbitmq/backend/worker/frontend）                                                             |

## 快速开始

### 方式一：Docker Compose 一键启动

```bash
docker compose up -d --build
```

- 前端：`http://localhost:5173`
- 后端 API：`http://localhost:8080`（健康检查 `GET /healthz`）
- RabbitMQ 管理台：`http://localhost:15672`（`admin` / `password123`）

### 方式二：脚本本地启动（热更新开发）

```bash
./start.sh                       # 依赖走 docker compose，API/Worker/前端跑本地
START_FRONTEND=0 ./start.sh      # 只跑 API + Worker
START_WORKER=0 ./start.sh        # 不启动 Worker
STOP_DOCKER=1 ./start.sh         # 退出时停掉 compose 依赖
```

### 方式三：手动分步

```bash
# 1. 依赖
docker compose up -d mysql redis rabbitmq

# 2. 后端（另开终端跑 worker）
cd backend && npm install && npm run build
npm start          # API :8080
npm run worker     # Worker 进程

# 3. 前端
cd frontend && npm install && npm run dev   # :5173
```

## 目录结构

```
├── backend/
│   └── src/
│       ├── main.ts / worker-main.ts   # API 进程 / Worker 进程入口
│       ├── common/                    # 错误、参数校验、鉴权、全局错误处理
│       ├── middleware/                # JWT / 软鉴权 / Redis 限流中间件
│       ├── lib/                       # schema(Drizzle 表)、db(AutoMigrate)、redis、mq、cache、fanout、sse-hub、uploads、tokens
│       ├── modules/                   # 各业务 Router + Service（account / video / like / comment / social / feed / message / notification）
│       └── workers/                   # outbox-poller、timeline-consumer、notification、like、comment、social、popularity、fanout
├── frontend/
│   └── src/
│       ├── api/                       # fetch 封装（自动 refresh token）+ 各模块 API
│       ├── pages/                     # 登录/注册/Feed/详情/上传/主页/话题/通知/私信/设置
│       ├── components/                # 播放器、视频卡片、评论、导航、上传组件…
│       ├── hooks/                     # useFeed（四种游标策略）、useSSE、useInfiniteScroll
│       └── context/                   # 登录态、通知未读数
├── docs/api-contract.md               # 前后端 API 契约
├── docker-compose.yml
├── .env.example
└── start.sh
```

## 核心设计

**双 Token + 服务端撤销**：Access 15 分钟 / Refresh 7 天；token 状态存 MySQL + Redis，登出/改密/改名即时失效。

- **鉴权缓存自愈**：校验优先 Redis `account:<id>`，未命中回退 MySQL `accounts.token`，通过后回填。
- **Feed 冷热分离**：发布走 Outbox → MQ → Redis ZSET `feed:global_timeline`（保留最近 1000 条热数据），查询热数据走 Redis、冷数据回源 MySQL 拼接（不回写，防污染）。
- **关注流推拉结合（对齐 GCFeed）**：FanoutWorker 消费发布事件按粉丝数分流——普通作者（粉丝 < 阈值）扇出写入粉丝收件箱 ZSET（写扩散），大V（粉丝 ≥ 阈值，默认 10000，`FANOUT_FOLLOWER_THRESHOLD` / Redis `config:fanout_threshold` 运行时可调）只写作者发件箱；读取侧把「收件箱 + 关注的大V发件箱」k-way 归并（`秒*1e6+id` 复合分数游标），关注回填历史、取关清理条目，索引缺失自动回退 SQL JOIN。
- **滑动窗口热榜**：互动热度按分钟窗 ZINCRBY，查询用 ZUNIONSTORE 合并最近 60 窗生成 `as_of` 快照 + offset 稳定分页；Redis 不可用回退 MySQL 复合游标 `(popularity, create_time, id)`。
- **复合游标分页**：点赞榜用 `(likes_count, id)` 元组游标，排序稳定不重不漏。
- **分布式锁防击穿**：视频详情/关注流/时间线回填用 `SET NX EX` 互斥，避免热点 Key 过期瞬间打穿 MySQL。
- **MQ 异常降级直写**：点赞/评论/关注事件发布失败自动降级为同步写 MySQL/Redis，并补发通知，保证"请求成功数据必落地"。
- **Outbox 最终一致**：视频与 outbox_msgs 同事务写入，Poller 投递成功才删除，时间线事件不丢。
- **SSE 实时通知**：点赞/评论/关注/提及经 NotificationWorker 落库并推送给在线连接，30 秒 keepalive，前端断线自动重连。
- **分片上传**：5MB 分片 + 整文件/分片 MD5 校验，Redis 会话记录已传分片支持断点续传，完成按序合并。
- **Redis 全程可选**：Redis/RabbitMQ 不可用时自动降级（直写 DB / 放行限流），恢复后自愈。

## 环境变量

见 [.env.example](.env.example)。关键项：`JWT_SECRET`（生产必须改）、`MYSQL_*`、`REDIS_*`、`RABBITMQ_*`、`SERVER_PORT`。

端口说明：MySQL 宿主机 `3307`；Redis 宿主机 `6381`（容器内仍是 6379）；前端开发端口 `5173`（被占用时 Vite 自动换 5174）。

## 冒烟测试

```bash
bash test/smoke.sh
```

覆盖 57 个断言：注册/登录/刷新/上传/发布/五种 Feed/点赞异步落库/评论删除权限/关注/关注流推拉结合（收件箱推、大V发件箱拉、关注回填、取关清理）/私信/通知/SSE/分片断点续传/改名换 token/登出撤销。注意注册限流为 5 次/时/IP，脚本会自动清掉 Redis 中的历史限流计数。

## 与 Go 版的差异

- 后端从 Gin + GORM 迁移为 Express 5 + Drizzle ORM（Router/Service 分层，中间件鉴权/限流；查询构建器贴近 SQL、类型从表结构推导；启动时 `CREATE TABLE IF NOT EXISTS` 完成 AutoMigrate）。
