import { request } from './client';
import type { NotificationListResponse, UnreadCountResponse } from '../types';

export function list(): Promise<NotificationListResponse> {
  return request<NotificationListResponse>('/notification/list', {});
}

/** 省略 id = 全部标记已读 */
export function markRead(id?: number): Promise<{ message: string }> {
  return request<{ message: string }>('/notification/markRead', id ? { id } : {});
}

export function unreadCount(): Promise<UnreadCountResponse> {
  return request<UnreadCountResponse>('/notification/unreadCount', {});
}
