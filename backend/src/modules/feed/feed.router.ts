import { Router } from 'express';
import { FeedService } from './feed.service';
import { softAuth } from '../../middleware/soft-auth';
import { requireAuth } from '../../middleware/auth';
import {
  optionalCursorNumber,
  optionalNumber,
  requireLimit,
  requireString,
} from '../../common/validate';

export function createFeedRouter(feedService: FeedService): Router {
  const router = Router();

  router.post('/listLatest', softAuth, async (req, res) => {
    const limit = requireLimit(req.body, 10, 50);
    const latestTime = optionalNumber(req.body, 'latest_time', 0);
    res.json(
      await feedService.listLatest(limit, latestTime, req.user?.accountId ?? null, !req.user),
    );
  });

  router.post('/listLikesCount', softAuth, async (req, res) => {
    const limit = requireLimit(req.body, 10, 50);
    const likesCountBefore = optionalCursorNumber(req.body, 'likes_count_before');
    const idBefore = optionalCursorNumber(req.body, 'id_before');
    res.json(
      await feedService.listLikesCount(
        limit,
        likesCountBefore,
        idBefore,
        req.user?.accountId ?? null,
      ),
    );
  });

  router.post('/listByPopularity', softAuth, async (req, res) => {
    const limit = requireLimit(req.body, 10, 50);
    const asOf = optionalNumber(req.body, 'as_of', 0);
    const offset = optionalNumber(req.body, 'offset', 0);
    const latestPopularity = optionalCursorNumber(req.body, 'latest_popularity');
    const rawBefore = req.body?.latest_before;
    const latestBefore =
      rawBefore === undefined || rawBefore === null || rawBefore === ''
        ? null
        : (rawBefore as string | number);
    const latestIdBefore = optionalCursorNumber(req.body, 'latest_id_before');
    res.json(
      await feedService.listByPopularity(
        limit,
        asOf,
        offset,
        {
          latest_popularity: latestPopularity,
          latest_before: latestBefore,
          latest_id_before: latestIdBefore,
        },
        req.user?.accountId ?? null,
      ),
    );
  });

  router.post('/listByFollowing', requireAuth, async (req, res) => {
    const limit = requireLimit(req.body, 10, 50);
    const latestTime = optionalNumber(req.body, 'latest_time', 0);
    res.json(await feedService.listByFollowing(limit, latestTime, req.user!.accountId));
  });

  router.post('/listByTag', softAuth, async (req, res) => {
    const tagName = requireString(req.body, 'tag_name', 100).replace(/^#/, '');
    const limit = requireLimit(req.body, 20, 50);
    res.json(await feedService.listByTag(tagName, limit, req.user?.accountId ?? null));
  });

  return router;
}
