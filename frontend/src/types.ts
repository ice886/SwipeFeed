// 全部类型以 docs/api-contract.md 为准。
// 注意 create_time：FeedVideoItem 为毫秒时间戳，Video/Comment/Notification/Message 为 ISO 字符串。

export interface Account {
  id: number;
  username: string;
  avatar_url?: string;
  bio?: string;
}

export interface FeedVideoItem {
  id: number;
  author: { id: number; username: string };
  title: string;
  description?: string;
  play_url: string;
  cover_url: string;
  create_time: number; // 毫秒时间戳
  likes_count: number;
  is_liked: boolean;
}

export interface Video {
  id: number;
  author_id: number;
  username: string;
  title: string;
  description?: string;
  play_url: string;
  cover_url: string;
  create_time: string; // ISO
  likes_count: number;
  popularity: number;
}

export interface Comment {
  id: number;
  username: string;
  video_id: number;
  author_id: number;
  content: string;
  created_at: string; // ISO
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'mention';

export interface Notification {
  id: number;
  recipient_id: number;
  sender_id: number;
  type: NotificationType;
  target_id: number;
  content: string;
  is_read: boolean;
  created_at: string; // ISO
}

export interface Message {
  id: number;
  from_id: number;
  to_id: number;
  content: string;
  is_read: boolean;
  created_at: string; // ISO
}

// ---------- account ----------

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refresh_token: string;
  account_id: number;
  username: string;
}

export interface RefreshResponse {
  token: string;
  account_id: number;
  username: string;
}

export interface ChangePasswordRequest {
  username: string;
  old_password: string;
  new_password: string;
}

export interface ProfileResponse {
  account: Account;
  video_count: number;
  total_likes: number;
  follower_count: number;
  vlogger_count: number;
}

export interface RenameResponse {
  token: string;
}

export interface AvatarUploadResponse {
  avatar_url: string;
}

// ---------- video ----------

export interface UploadVideoResponse {
  url: string;
  play_url: string;
}

export interface UploadCoverResponse {
  url: string;
  cover_url: string;
}

export interface ChunkInitRequest {
  filename: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  file_hash: string;
}

export interface ChunkInitResponse {
  upload_id: string;
  uploaded_chunks: number[];
}

export interface ChunkStatusResponse {
  upload_id: string;
  uploaded_chunks: number[];
  total_chunks: number;
}

export interface PublishRequest {
  title: string;
  description: string;
  play_url: string;
  cover_url: string;
}

export interface PublishResponse {
  video: Video;
}

export interface VideoListResponse {
  videos: Video[];
}

export interface VideoDetailResponse {
  video_detail: Video;
}

// ---------- like ----------

export interface IsLikedResponse {
  is_liked: boolean;
}

// ---------- comment ----------

export interface CommentListResponse {
  comments: Comment[];
}

// ---------- social ----------

export interface FollowResponse {
  message: string;
}

export interface FollowersResponse {
  followers: Account[];
  follower_count: number;
}

export interface VloggersResponse {
  vloggers: Account[];
  vlogger_count: number;
}

export interface CountsResponse {
  follower_count: number;
  vlogger_count: number;
}

// ---------- feed ----------

export interface FeedLatestRequest {
  limit: number;
  latest_time: number; // 0 = 第一页
}

export interface FeedLatestResponse {
  video_list: FeedVideoItem[];
  next_time: number;
  has_more: boolean;
}

export interface FeedLikesRequest {
  limit: number;
  likes_count_before?: number;
  id_before?: number;
}

export interface FeedLikesResponse {
  video_list: FeedVideoItem[];
  next_likes_count_before?: number;
  next_id_before?: number;
  has_more: boolean;
}

export type FeedCursorValue = number | string;

export interface FeedPopularityRequest {
  limit: number;
  as_of?: number;
  offset?: number;
  latest_popularity?: number;
  latest_before?: FeedCursorValue;
  latest_id_before?: number;
}

export interface FeedPopularityResponse {
  video_list: FeedVideoItem[];
  as_of: number;
  next_offset: number;
  has_more: boolean;
  next_latest_popularity?: number;
  next_latest_before?: FeedCursorValue;
  next_latest_id_before?: number;
}

export interface FeedTagRequest {
  tag_name: string;
  limit: number;
}

export interface FeedTagResponse {
  video_list: FeedVideoItem[];
}

// ---------- notification / message ----------

export interface NotificationListResponse {
  notifications: Notification[];
}

export interface UnreadCountResponse {
  count: number;
}

export interface MessageSendRequest {
  to_id: number;
  content: string;
}

export interface MessageSendResponse {
  message: Message;
}

export interface MessageListResponse {
  messages: Message[];
}
