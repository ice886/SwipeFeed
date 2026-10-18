import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { VideoService } from './video.service';
import { ChunkService } from './chunk.service';
import { requireAuth } from '../../middleware/auth';
import { softAuth } from '../../middleware/soft-auth';
import {
  optionalString,
  requireNonNegative,
  requireNumber,
  requireString,
} from '../../common/validate';
import { badRequest } from '../../common/errors';
import { config } from '../../config';
import { saveCover, saveVideo, randomName, validateExt } from '../../lib/uploads';

const stagingDir = path.join(config.uploadDir, 'tmp', 'staging');

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(stagingDir, { recursive: true });
    cb(null, stagingDir);
  },
  filename: (_req, file, cb) => cb(null, randomName(path.extname(file.originalname) || '.mp4')),
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export function createVideoRouter(
  videoService: VideoService,
  chunkService: ChunkService,
): Router {
  const router = Router();

  router.post('/uploadVideo', requireAuth, videoUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('file is required');
    const accountId = req.user!.accountId;
    const url = saveVideo(accountId, file.originalname, file.path);
    res.json({ url, play_url: url });
  });

  router.post('/uploadCover', requireAuth, coverUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('file is required');
    const url = saveCover(req.user!.accountId, file.originalname, file.buffer);
    res.json({ url, cover_url: url });
  });

  router.post('/chunk/init', requireAuth, async (req, res) => {
    const filename = requireString(req.body, 'filename', 255);
    validateExt(filename, ['.mp4']);
    const fileSize = requireNumber(req.body, 'file_size');
    const chunkSize = requireNumber(req.body, 'chunk_size');
    const totalChunks = requireNumber(req.body, 'total_chunks');
    const fileHash = requireString(req.body, 'file_hash', 64);
    res.json(
      await chunkService.init(
        req.user!.accountId,
        filename,
        fileSize,
        chunkSize,
        totalChunks,
        fileHash,
      ),
    );
  });

  router.post('/chunk/upload', requireAuth, chunkUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('file is required');
    const uploadId = requireString(req.body, 'upload_id', 64);
    const chunkIndex = requireNonNegative(req.body, 'chunk_index');
    const chunkHash = optionalString(req.body, 'chunk_hash', 64);
    res.json(
      await chunkService.uploadChunk(
        req.user!.accountId,
        uploadId,
        chunkIndex,
        chunkHash,
        file.buffer,
      ),
    );
  });

  router.post('/chunk/status', requireAuth, async (req, res) => {
    const uploadId = requireString(req.body, 'upload_id', 64);
    res.json(await chunkService.status(req.user!.accountId, uploadId));
  });

  router.post('/chunk/complete', requireAuth, async (req, res) => {
    const uploadId = requireString(req.body, 'upload_id', 64);
    res.json(await chunkService.complete(req.user!.accountId, uploadId));
  });

  router.post('/publish', requireAuth, async (req, res) => {
    const title = requireString(req.body, 'title', 255);
    const description = optionalString(req.body, 'description', 255);
    const playUrl = requireString(req.body, 'play_url', 512);
    const coverUrl = requireString(req.body, 'cover_url', 512);
    const video = await videoService.publish(
      req.user!.accountId,
      req.user!.username,
      title,
      description,
      playUrl,
      coverUrl,
    );
    res.json({ video });
  });

  router.post('/listByAuthorID', softAuth, async (req, res) => {
    const authorId = requireNumber(req.body, 'author_id');
    const videos = await videoService.listByAuthorID(authorId);
    res.json({ videos });
  });

  router.post('/getDetail', softAuth, async (req, res) => {
    const id = requireNumber(req.body, 'id');
    const video_detail = await videoService.getDetail(id);
    res.json({ video_detail });
  });

  return router;
}
