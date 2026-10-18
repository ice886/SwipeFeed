import { request } from './client';
import type { IsLikedResponse, VideoListResponse } from '../types';

export function like(video_id: number): Promise<{ message: string }> {
  return request<{ message: string }>('/like/like', { video_id });
}

export function unlike(video_id: number): Promise<{ message: string }> {
  return request<{ message: string }>('/like/unlike', { video_id });
}

export function isLiked(video_id: number): Promise<IsLikedResponse> {
  return request<IsLikedResponse>('/like/isLiked', { video_id });
}

export function listMyLikedVideos(): Promise<VideoListResponse> {
  return request<VideoListResponse>('/like/listMyLikedVideos', {});
}
