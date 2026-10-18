import { request } from './client';
import type {
  FeedLatestRequest,
  FeedLatestResponse,
  FeedLikesRequest,
  FeedLikesResponse,
  FeedPopularityRequest,
  FeedPopularityResponse,
  FeedTagRequest,
  FeedTagResponse,
} from '../types';

export function listLatest(body: FeedLatestRequest): Promise<FeedLatestResponse> {
  return request<FeedLatestResponse>('/feed/listLatest', body);
}

export function listByFollowing(body: FeedLatestRequest): Promise<FeedLatestResponse> {
  return request<FeedLatestResponse>('/feed/listByFollowing', body);
}

export function listLikesCount(body: FeedLikesRequest): Promise<FeedLikesResponse> {
  return request<FeedLikesResponse>('/feed/listLikesCount', body);
}

export function listByPopularity(body: FeedPopularityRequest): Promise<FeedPopularityResponse> {
  return request<FeedPopularityResponse>('/feed/listByPopularity', body);
}

export function listByTag(body: FeedTagRequest): Promise<FeedTagResponse> {
  return request<FeedTagResponse>('/feed/listByTag', body);
}
