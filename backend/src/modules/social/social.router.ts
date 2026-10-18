import { Router } from 'express';
import { SocialService } from './social.service';
import { requireAuth } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rate-limit';
import { optionalNumber, requireNumber } from '../../common/validate';

export function createSocialRouter(socialService: SocialService): Router {
  const router = Router();

  router.post(
    '/follow',
    requireAuth,
    rateLimit('follow', 20, 60_000, 'account'),
    async (req, res) => {
      const vloggerId = requireNumber(req.body, 'vlogger_id');
      await socialService.follow(req.user!.accountId, req.user!.username, vloggerId);
      res.json({ message: 'followed' });
    },
  );

  router.post(
    '/unfollow',
    requireAuth,
    rateLimit('follow', 20, 60_000, 'account'),
    async (req, res) => {
      const vloggerId = requireNumber(req.body, 'vlogger_id');
      await socialService.unfollow(req.user!.accountId, vloggerId);
      res.json({ message: 'unfollowed' });
    },
  );

  router.post('/getAllFollowers', requireAuth, async (req, res) => {
    const vloggerId =
      optionalNumber(req.body, 'vlogger_id', req.user!.accountId) || req.user!.accountId;
    res.json(await socialService.getAllFollowers(vloggerId));
  });

  router.post('/getAllVloggers', requireAuth, async (req, res) => {
    const followerId =
      optionalNumber(req.body, 'follower_id', req.user!.accountId) || req.user!.accountId;
    res.json(await socialService.getAllVloggers(followerId));
  });

  router.post('/getCounts', requireAuth, async (req, res) => {
    res.json(await socialService.getCounts(req.user!.accountId));
  });

  return router;
}
