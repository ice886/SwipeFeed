import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from '../config';
import { badRequest } from '../common/errors';

/** 上传文件落盘：.run/uploads/{avatars,covers,videos,tmp}/...，URL 前缀 /static */

export const URL_PREFIX = '/static';

function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dateDir(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function extOf(originalname: string, allowed: string[]): string {
  const ext = path.extname(originalname || '').toLowerCase();
  if (!allowed.includes(ext)) {
    throw badRequest(`file type not allowed, allowed: ${allowed.join('/')}`);
  }
  return ext;
}

export function validateExt(originalname: string, allowed: string[]): string {
  return extOf(originalname, allowed);
}

export function randomName(ext: string): string {
  return `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
}

/** 存放头像：avatars/<accountID>/<file> */
export function saveAvatar(accountId: number, originalname: string, buf: Buffer): string {
  const ext = extOf(originalname, ['.jpg', '.jpeg', '.png', '.webp']);
  const dir = ensureDir(path.join(config.uploadDir, 'avatars', String(accountId)));
  const name = randomName(ext);
  fs.writeFileSync(path.join(dir, name), buf);
  return `${URL_PREFIX}/avatars/${accountId}/${name}`;
}

/** 存放封面：covers/<accountID>/<date>/<file> */
export function saveCover(accountId: number, originalname: string, buf: Buffer): string {
  const ext = extOf(originalname, ['.jpg', '.jpeg', '.png', '.webp']);
  const dir = ensureDir(path.join(config.uploadDir, 'covers', String(accountId), dateDir()));
  const name = randomName(ext);
  fs.writeFileSync(path.join(dir, name), buf);
  return `${URL_PREFIX}/covers/${accountId}/${dateDir()}/${name}`;
}

/** 存放视频：videos/<accountID>/<date>/<file>.mp4 */
export function saveVideo(accountId: number, originalname: string, sourcePath: string): string {
  const ext = extOf(originalname, ['.mp4']);
  const dir = ensureDir(path.join(config.uploadDir, 'videos', String(accountId), dateDir()));
  const name = randomName(ext);
  fs.renameSync(sourcePath, path.join(dir, name));
  return `${URL_PREFIX}/videos/${accountId}/${dateDir()}/${name}`;
}

/** 分片临时目录：tmp/<uploadID>/<chunkIndex> */
export function chunkDir(uploadId: string): string {
  return ensureDir(path.join(config.uploadDir, 'tmp', uploadId));
}

export function saveChunk(uploadId: string, chunkIndex: number, buf: Buffer): void {
  const dir = chunkDir(uploadId);
  fs.writeFileSync(path.join(dir, String(chunkIndex)), buf);
}

export function chunkPath(uploadId: string, chunkIndex: number): string {
  return path.join(chunkDir(uploadId), String(chunkIndex));
}

export function cleanupChunks(uploadId: string): void {
  try {
    fs.rmSync(path.join(config.uploadDir, 'tmp', uploadId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** 合并分片为最终视频文件，返回 /static URL */
export function mergeChunks(
  uploadId: string,
  accountId: number,
  filename: string,
  totalChunks: number,
): string {
  const ext = extOf(filename, ['.mp4']);
  const dir = ensureDir(path.join(config.uploadDir, 'videos', String(accountId), dateDir()));
  const name = randomName(ext);
  const finalPath = path.join(dir, name);
  const fd = fs.openSync(finalPath, 'w');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const p = chunkPath(uploadId, i);
      if (!fs.existsSync(p)) {
        throw badRequest(`chunk ${i} missing`);
      }
      fs.writeSync(fd, fs.readFileSync(p));
    }
  } catch (err) {
    fs.rmSync(finalPath, { force: true });
    throw err;
  } finally {
    fs.closeSync(fd);
  }
  cleanupChunks(uploadId);
  return `${URL_PREFIX}/videos/${accountId}/${dateDir()}/${name}`;
}

export function uploadDirPath(...parts: string[]): string {
  return path.join(config.uploadDir, ...parts);
}
