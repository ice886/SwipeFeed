import { request } from './client';
import type { MessageListResponse, MessageSendResponse } from '../types';

export function send(to_id: number, content: string): Promise<MessageSendResponse> {
  return request<MessageSendResponse>('/message/send', { to_id, content });
}

export function list(peer_id: number): Promise<MessageListResponse> {
  return request<MessageListResponse>('/message/list', { peer_id });
}
