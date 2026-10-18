# API 契约（Node.js 版，与 Go 版接口保持兼容）

- 后端监听 `http://localhost:8080`，所有业务接口为 **POST + JSON**（除 SSE 与健康检查）。
- 前端开发时通过 Vite 代理 `/api` → `http://127.0.0.1:8080`（去掉 `/api` 前缀），生产走 nginx 同样代理。
- 上传的静态文件由后端挂在 `/static` → `.run/uploads`，数据库/JSON 里存的 `play_url` / `cover_url` / `avatar_url` 形如 `/static/videos/<accountID>/<date>/<file>.mp4`。
- 鉴权：请求头 `Authorization: Bearer <access_token>`。
  - **JWT**：必须登录。
  - **软鉴权**：可匿名；带了 token 必须合法，非法则 401。
- 成功响应：扁平 JSON 对象（无 envelope）。错误响应：`{"error": "<message>"}`，状态码 400/401/403/404/409/429/500。
- 时间字段：数据库实体用 ISO 时间字符串；Feed 条目 `create_time` 为 **毫秒时间戳（int64）**。
- Access Token 15 分钟过期，Refresh Token 7 天；登录/刷新/登出/改密/改名都会写服务端 token 状态（MySQL + Redis），支持撤销。

## 通用类型

```ts
Account = { id: number; username: string; avatar_url?: string; bio?: string }  // password/token 永不返回

FeedVideoItem = {
  id: number
  author: { id: number; username: string }
  title: string
  description?: string
  play_url: string
  cover_url: string
  create_time: number        // ms
  likes_count: number
  is_liked: boolean
}

Notification = {
  id: number; recipient_id: number; sender_id: number
  type: "like" | "comment" | "follow" | "mention"
  target_id: number          // 视频 ID 或评论相关 ID
  content: string
  is_read: boolean
  created_at: string         // ISO
}

Message = { id: number; from_id: number; to_id: number; content: string; is_read: boolean; created_at: string }

Comment = { id: number; username: string; video_id: number; author_id: number; content: string; created_at: string }
```

## /account

| 路径 | 鉴权 | 请求 | 响应 |
|---|---|---|---|
| `/account/register` | 无（限流 5次/时/IP） | `{username, password}` | `{message: "account created"}`；用户名占用 → 409 |
| `/account/login` | 无（限流 10次/分/IP） | `{username, password}` | `{token, refresh_token, account_id, username}` |
| `/account/refresh` | 无 | `{refresh_token}` | `{token, account_id, username}` |
| `/account/changePassword` | 无 | `{username, old_password, new_password}` | `{message}`；改密后所有 token 失效 |
| `/account/findByID` | 无 | `{id}` | `Account` |
| `/account/findByUsername` | 无 | `{username}` | `Account`（查不到 404） |
| `/account/getProfile` | 无 | `{account_id}` | `{account: Account, video_count, total_likes, follower_count, vlogger_count}` |
| `/account/logout` | JWT | `{}` | `{message}`（双 token 失效） |
| `/account/rename` | JWT | `{new_username}` | `{token}`（新 JWT，旧 token 立即失效） |
| `/account/uploadAvatar` | JWT | multipart `file`（jpg/png/webp ≤10MB） | `{avatar_url}` |
| `/account/updateProfile` | JWT | `{avatar_url, bio}` | `{message}` |

## /video

| 路径 | 鉴权 | 请求 | 响应 |
|---|---|---|---|
| `/video/uploadVideo` | JWT | multipart `file`（mp4 ≤200MB） | `{url, play_url}` |
| `/video/uploadCover` | JWT | multipart `file`（jpg/png/webp ≤10MB） | `{url, cover_url}` |
| `/video/chunk/init` | JWT | `{filename, file_size, chunk_size, total_chunks, file_hash}` | `{upload_id, uploaded_chunks: number[]}`（同 hash 复用会话→断点续传） |
| `/video/chunk/upload` | JWT | multipart `upload_id, chunk_index, chunk_hash, file` | `{chunk_index}`；分片 MD5 不符 → 400 |
| `/video/chunk/status` | JWT | `{upload_id}` | `{upload_id, uploaded_chunks: number[], total_chunks}` |
| `/video/chunk/complete` | JWT | `{upload_id}` | `{url, play_url}`；分片不全 → 400 |
| `/video/publish` | JWT | `{title, description, play_url, cover_url}` | `{video: Video}`；自动提取 `#话题`，事务写视频+outbox+标签 |
| `/video/listByAuthorID` | 无 | `{author_id}` | `{videos: Video[]}`（按发布时间倒序） |
| `/video/getDetail` | 无 | `{id}` | `{video_detail: Video}`（Redis 缓存 5 分钟 + 互斥锁防击穿） |

`Video` = `{id, author_id, username, title, description?, play_url, cover_url, create_time: ISO, likes_count, popularity}`

## /like（限流 30次/分/账号）

| 路径 | 鉴权 | 请求 | 响应 |
|---|---|---|---|
| `/like/like` | JWT | `{video_id}` | `{message}` |
| `/like/unlike` | JWT | `{video_id}` | `{message}` |
| `/like/isLiked` | JWT | `{video_id}` | `{is_liked: boolean}` |
| `/like/listMyLikedVideos` | JWT | `{}` | `{videos: Video[]}` |

点赞/取消点赞走 RabbitMQ 异步落库（`like.events`），MQ 失败降级直写；触发热度更新与作者通知（SSE）。

## /comment

| 路径 | 鉴权 | 请求 | 响应 |
|---|---|---|---|
| `/comment/listAll` | 无 | `{video_id}` | `{comments: Comment[]}`（最多 200 条，时间升序） |
| `/comment/publish` | JWT（限流 10次/分/账号） | `{video_id, content}` | `{message}`；`@username` 触发提及通知 |
| `/comment/delete` | JWT | `{comment_id}` | `{message}`；仅评论作者可删 → 否则 403 |

## /social

| 路径 | 鉴权 | 请求 | 响应 |
|---|---|---|---|
| `/social/follow` | JWT（限流 20次/分/账号） | `{vlogger_id}` | `{message}` |
| `/social/unfollow` | JWT | `{vlogger_id}` | `{message}` |
| `/social/getAllFollowers` | JWT | `{vlogger_id?}`（省略=自己） | `{followers: Account[], follower_count}` |
| `/social/getAllVloggers` | JWT | `{follower_id?}`（省略=自己） | `{vloggers: Account[], vlogger_count}` |
| `/social/getCounts` | JWT | `{}` | `{follower_count, vlogger_count}` |

## /feed（除关注流均为软鉴权）

| 路径 | 请求 | 响应 |
|---|---|---|
| `/feed/listLatest` | `{limit, latest_time}`（latest_time=0 表示第一页） | `{video_list: FeedVideoItem[], next_time, has_more}` |
| `/feed/listLikesCount` | `{limit, likes_count_before?, id_before?}` | `{video_list, next_likes_count_before?, next_id_before?, has_more}`（复合游标） |
| `/feed/listByPopularity` | `{limit, as_of?, offset?, latest_popularity?, latest_before?, latest_id_before?}` | `{video_list, as_of, next_offset, has_more, next_latest_popularity?, next_latest_before?, next_latest_id_before?}`（快照分页：首次返回 as_of，翻页带原 as_of+offset） |
| `/feed/listByFollowing` | JWT，`{limit, latest_time}` | `{video_list, next_time, has_more}` |
| `/feed/listByTag` | `{tag_name, limit}` | `{video_list: FeedVideoItem[]}` |

实现要点：`listLatest` 冷热分离（Redis ZSET `feed:global_timeline` 热数据 + MySQL 冷数据拼接）；`listByPopularity` 优先 Redis 分钟窗 ZUNIONSTORE 快照，不可用回退 MySQL 复合游标。

## /notification（全部 JWT）

| 路径 | 请求 | 响应 |
|---|---|---|
| `GET /notification/stream?token=<access_token>` | —（也支持 `Authorization: Bearer`） | SSE：`data: <Notification JSON>`，30s keepalive 注释行 |
| `/notification/list` | `{}` | `{notifications: Notification[]}`（最近 50 条，倒序） |
| `/notification/markRead` | `{id?}` | `{message}`；省略 id 全部已读 |
| `/notification/unreadCount` | `{}` | `{count}` |

## /message（全部 JWT）

| 路径 | 请求 | 响应 |
|---|---|---|
| `/message/send` | `{to_id, content}` | `{message: Message}` |
| `/message/list` | `{peer_id}` | `{messages: Message[]}`（与对端最近 50 条，时间正序） |

## 其他

- `GET /healthz` → `{"status":"ok"}`
- 静态文件：`GET /static/*` → `.run/uploads/*`
- 限流超限 → 429 `{"error":"too many requests"}`

## 异步架构（后端实现，前端无感知）

- RabbitMQ Topic Exchange：`like.events`（like.like/like.unlike）、`comment.events`（comment.publish/comment.delete）、`social.events`（social.follow/social.unfollow）、`video.popularity.events`（video.popularity.update）、`video.timeline.events`（video.timeline.publish），全部配 DLX。
- API 进程内：OutboxPoller（`outbox_msgs` 表 → 时间线事件）、TimelineConsumer（写 `feed:global_timeline`）、NotificationWorker（消费互动事件 → `notifications` 表 + SSE 推送）。
- Worker 进程（`npm run worker`）：LikeWorker / CommentWorker / SocialWorker / PopularityWorker（消费 MQ 异步落库、更新 likes_count/popularity、失效缓存）。
