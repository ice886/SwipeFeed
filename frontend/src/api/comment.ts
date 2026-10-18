import { request } from './client';
import type { CommentListResponse } from '../types';

export function listAll(video_id: number): Promise<CommentListResponse> {
  return request<CommentListResponse>('/comment/listAll', { video_id });
}

export function publish(video_id: number, content: string): Promise<{ message: string }> {
  return request<{ message: string }>('/comment/publish', { video_id, content });
}

export function remove(comment_id: number): Promise<{ message: string }> {
  return request<{ message: string }>('/comment/delete', { comment_id });
}
