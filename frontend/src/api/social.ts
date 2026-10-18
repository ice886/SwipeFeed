import { request } from './client';
import type { CountsResponse, FollowersResponse, FollowResponse, VloggersResponse } from '../types';

export function follow(vlogger_id: number): Promise<FollowResponse> {
  return request<FollowResponse>('/social/follow', { vlogger_id });
}

export function unfollow(vlogger_id: number): Promise<FollowResponse> {
  return request<FollowResponse>('/social/unfollow', { vlogger_id });
}

/** vlogger_id 省略 = 自己的粉丝列表 */
export function getAllFollowers(vlogger_id?: number): Promise<FollowersResponse> {
  return request<FollowersResponse>('/social/getAllFollowers', vlogger_id ? { vlogger_id } : {});
}

/** follower_id 省略 = 自己关注的人 */
export function getAllVloggers(follower_id?: number): Promise<VloggersResponse> {
  return request<VloggersResponse>('/social/getAllVloggers', follower_id ? { follower_id } : {});
}

export function getCounts(): Promise<CountsResponse> {
  return request<CountsResponse>('/social/getCounts', {});
}
