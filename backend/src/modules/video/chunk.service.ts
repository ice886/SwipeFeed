import * as crypto from 'crypto';
import { KEYS } from '../../lib/cache';
import * as redisLib from '../../lib/redis';
import { newUploadId } from '../../lib/tokens';
import {
  chunkPath,
  cleanupChunks,
  mergeChunks,
  saveChunk,
  validateExt,
} from '../../lib/uploads';
import * as fs from 'fs';
import { badRequest, notFound } from '../../common/errors';

export interface ChunkSession {
  upload_id: string;
  account_id: number;
  filename: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  file_hash: string;
  uploaded_bits: boolean[];
}

const SESSION_TTL = 24 * 3600;
const MAX_CHUNKS = 10_000;

export class ChunkService {
  private async getSession(uploadId: string, accountId: number): Promise<ChunkSession> {
    const session = await redisLib.getJSON<ChunkSession>(KEYS.chunkSession(uploadId));
    if (!session || session.account_id !== accountId) throw notFound('upload session not found');
    return session;
  }

  private async saveSession(session: ChunkSession): Promise<void> {
    await redisLib.setJSON(KEYS.chunkSession(session.upload_id), session, SESSION_TTL);
  }

  private uploadedChunks(session: ChunkSession): number[] {
    const out: number[] = [];
    session.uploaded_bits.forEach((bit, i) => {
      if (bit) out.push(i);
    });
    return out;
  }

  /** 初始化分片上传：同账号同文件 hash 复用会话（断点续传） */
  async init(
    accountId: number,
    filename: string,
    fileSize: number,
    chunkSize: number,
    totalChunks: number,
    fileHash: string,
  ) {
    validateExt(filename, ['.mp4']);
    if (fileSize <= 0 || chunkSize <= 0 || totalChunks <= 0 || totalChunks > MAX_CHUNKS) {
      throw badRequest('invalid chunk params');
    }

    const indexKey = KEYS.chunkHashIndex(accountId, fileHash);
    const existingId = await redisLib.get(indexKey);
    if (existingId) {
      const existing = await redisLib.getJSON<ChunkSession>(KEYS.chunkSession(existingId));
      if (existing && existing.account_id === accountId && existing.file_hash === fileHash) {
        return { upload_id: existing.upload_id, uploaded_chunks: this.uploadedChunks(existing) };
      }
    }

    const uploadId = newUploadId();
    const session: ChunkSession = {
      upload_id: uploadId,
      account_id: accountId,
      filename,
      file_size: fileSize,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      file_hash: fileHash,
      uploaded_bits: new Array(totalChunks).fill(false),
    };
    await this.saveSession(session);
    await redisLib.set(indexKey, uploadId, SESSION_TTL);
    return { upload_id: uploadId, uploaded_chunks: [] as number[] };
  }

  /** 上传单个分片：MD5 校验后落盘 tmp/<uploadID>/<index> */
  async uploadChunk(
    accountId: number,
    uploadId: string,
    chunkIndex: number,
    chunkHash: string,
    buf: Buffer,
  ) {
    const session = await this.getSession(uploadId, accountId);
    if (chunkIndex < 0 || chunkIndex >= session.total_chunks) throw badRequest('invalid chunk_index');
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    if (chunkHash && md5 !== chunkHash) throw badRequest('chunk hash mismatch');

    saveChunk(uploadId, chunkIndex, buf);
    session.uploaded_bits[chunkIndex] = true;
    await this.saveSession(session);
    return { chunk_index: chunkIndex };
  }

  async status(accountId: number, uploadId: string) {
    const session = await this.getSession(uploadId, accountId);
    return {
      upload_id: session.upload_id,
      uploaded_chunks: this.uploadedChunks(session),
      total_chunks: session.total_chunks,
    };
  }

  /** 合并分片：校验完整后按序拼接成 mp4，清理临时文件与会话 */
  async complete(accountId: number, uploadId: string) {
    const session = await this.getSession(uploadId, accountId);
    const missing = session.uploaded_bits.reduce<number[]>((acc, bit, i) => {
      if (!bit) acc.push(i);
      return acc;
    }, []);
    if (missing.length > 0) {
      throw badRequest(`chunks missing: ${missing.slice(0, 10).join(',')}${missing.length > 10 ? '...' : ''}`);
    }
    for (let i = 0; i < session.total_chunks; i++) {
      if (!fs.existsSync(chunkPath(uploadId, i))) throw badRequest(`chunk ${i} missing on disk`);
    }

    const url = mergeChunks(uploadId, accountId, session.filename, session.total_chunks);
    await redisLib.del(KEYS.chunkSession(uploadId), KEYS.chunkHashIndex(accountId, session.file_hash));
    cleanupChunks(uploadId);
    return { url, play_url: url };
  }
}
