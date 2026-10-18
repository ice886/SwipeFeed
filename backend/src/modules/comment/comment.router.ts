import { Router } from 'express';
import { CommentService } from './comment.service';
import { requireAuth } from '../../middleware/auth';
import { softAuth } from '../../middleware/soft-auth';
import { rateLimit } from '../../middleware/rate-limit';
import { requireNumber, requireString } from '../../common/validate';

export function createCommentRouter(commentService: CommentService): Router {
  const router = Router();

  router.post('/listAll', softAuth, async (req, res) => {
    const videoId = requireNumber(req.body, 'video_id');
    const comments = await commentService.listAll(videoId);
    res.json({ comments });
  });

  router.post(
    '/publish',
    requireAuth,
    rateLimit('comment', 10, 60_000, 'account'),
    async (req, res) => {
      const videoId = requireNumber(req.body, 'video_id');
      const content = requireString(req.body, 'content', 2000);
      res.json(
        await commentService.publish(req.user!.accountId, req.user!.username, videoId, content),
      );
    },
  );

  router.post(
    '/delete',
    requireAuth,
    rateLimit('comment', 10, 60_000, 'account'),
    async (req, res) => {
      const commentId = requireNumber(req.body, 'comment_id');
      await commentService.delete(req.user!.accountId, commentId);
      res.json({ message: 'comment deleted' });
    },
  );

  return router;
}
