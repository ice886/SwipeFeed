import { Router } from 'express';
import { LikeService } from './like.service';
import { requireAuth } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rate-limit';

export function createLikeRouter(likeService: LikeService): Router {
  const router = Router();

  router.post('/like', requireAuth, rateLimit('like', 30, 60_000, 'account'), async (req, res) => {
    const videoId = await likeService.requireVideoId(req.body);
    await likeService.like(req.user!.accountId, req.user!.username, videoId);
    res.json({ message: 'liked' });
  });

  router.post('/unlike', requireAuth, rateLimit('like', 30, 60_000, 'account'), async (req, res) => {
    const videoId = await likeService.requireVideoId(req.body);
    await likeService.unlike(req.user!.accountId, req.user!.username, videoId);
    res.json({ message: 'unliked' });
  });

  router.post('/isLiked', requireAuth, async (req, res) => {
    const videoId = await likeService.requireVideoId(req.body);
    const is_liked = await likeService.isLiked(req.user!.accountId, videoId);
    res.json({ is_liked });
  });

  router.post('/listMyLikedVideos', requireAuth, async (req, res) => {
    res.json(await likeService.listMyLikedVideos(req.user!.accountId));
  });

  return router;
}
