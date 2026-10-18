import { request, uploadForm } from './client';
import { hashBlob, hashFile } from '../utils/md5';
import type {
  ChunkInitResponse,
  ChunkStatusResponse,
  PublishRequest,
  PublishResponse,
  UploadCoverResponse,
  UploadVideoResponse,
  VideoDetailResponse,
  VideoListResponse,
} from '../types';

// ---------- 直传 / 封面 ----------

export function uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<UploadVideoResponse> {
  const form = new FormData();
  form.append('file', file);
  return uploadForm<UploadVideoResponse>('/video/uploadVideo', form, onProgress);
}

export function uploadCover(file: File, onProgress?: (percent: number) => void): Promise<UploadCoverResponse> {
  const form = new FormData();
  form.append('file', file);
  return uploadForm<UploadCoverResponse>('/video/uploadCover', form, onProgress);
}

// ---------- 分片上传 ----------

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
export const CHUNK_THRESHOLD = 30 * 1024 * 1024; // 大于 30MB 走分片

export function chunkInit(body: {
  filename: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  file_hash: string;
}): Promise<ChunkInitResponse> {
  return request<ChunkInitResponse>('/video/chunk/init', body);
}

export function chunkUpload(
  upload_id: string,
  chunk_index: number,
  chunk_hash: string,
  blob: Blob,
  filename: string,
  onProgress?: (percent: number) => void,
): Promise<{ chunk_index: number }> {
  const form = new FormData();
  form.append('upload_id', upload_id);
  form.append('chunk_index', String(chunk_index));
  form.append('chunk_hash', chunk_hash);
  form.append('file', blob, filename);
  return uploadForm<{ chunk_index: number }>('/video/chunk/upload', form, onProgress);
}

export function chunkStatus(upload_id: string): Promise<ChunkStatusResponse> {
  return request<ChunkStatusResponse>('/video/chunk/status', { upload_id });
}

export function chunkComplete(upload_id: string): Promise<UploadVideoResponse> {
  return request<UploadVideoResponse>('/video/chunk/complete', { upload_id });
}

export type VideoUploadPhase = 'hashing' | 'uploading' | 'finishing';

export interface UploadProgress {
  percent: number;
  phase: VideoUploadPhase;
}

/**
 * 上传视频：小于 30MB 直传，大于 30MB 用 5MB 分片 + spark-md5 校验 + 断点续传。
 * 返回 {url, play_url}。
 */
export async function uploadVideoFile(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadVideoResponse> {
  if (file.size <= CHUNK_THRESHOLD) {
    onProgress?.({ percent: 0, phase: 'uploading' });
    const res = await uploadVideo(file, (percent) => onProgress?.({ percent, phase: 'uploading' }));
    onProgress?.({ percent: 100, phase: 'finishing' });
    return res;
  }

  // 1. 计算整文件 MD5
  const fileHash = await hashFile(file, (percent) => onProgress?.({ percent: Math.min(percent, 100), phase: 'hashing' }));

  // 2. 初始化分片会话
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const init = await chunkInit({
    filename: file.name,
    file_size: file.size,
    chunk_size: CHUNK_SIZE,
    total_chunks: totalChunks,
    file_hash: fileHash,
  });

  // 3. 查询已上传分片（断点续传）
  let uploaded = new Set<number>(init.uploaded_chunks ?? []);
  try {
    const status = await chunkStatus(init.upload_id);
    uploaded = new Set<number>(status.uploaded_chunks ?? []);
  } catch {
    // status 查询失败不阻塞，用 init 返回的结果继续
  }

  // 4. 逐片上传（带进度），跳过已完成的分片
  const remaining = totalChunks - uploaded.size;
  let done = 0;
  for (let index = 0; index < totalChunks; index += 1) {
    if (uploaded.has(index)) continue;
    const start = index * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    const chunkHash = await hashBlob(blob);
    await chunkUpload(init.upload_id, index, chunkHash, blob, file.name, (percent) => {
      const overall = Math.round(((done + percent / 100) / Math.max(remaining, 1)) * 100);
      onProgress?.({ percent: Math.min(overall, 99), phase: 'uploading' });
    });
    done += 1;
    onProgress?.({
      percent: Math.min(Math.round((done / Math.max(remaining, 1)) * 100), 99),
      phase: 'uploading',
    });
  }

  // 5. 合并
  onProgress?.({ percent: 99, phase: 'finishing' });
  const res = await chunkComplete(init.upload_id);
  onProgress?.({ percent: 100, phase: 'finishing' });
  return res;
}

// ---------- 发布 / 查询 ----------

export function publish(body: PublishRequest): Promise<PublishResponse> {
  return request<PublishResponse>('/video/publish', body);
}

export function listByAuthorID(author_id: number): Promise<VideoListResponse> {
  return request<VideoListResponse>('/video/listByAuthorID', { author_id });
}

export function getDetail(id: number): Promise<VideoDetailResponse> {
  return request<VideoDetailResponse>('/video/getDetail', { id });
}
