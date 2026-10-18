import { Router } from 'express';
import type { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { requireAuth } from '../../middleware/auth';
import { authenticate } from '../../common/auth';
import { sseHub } from '../../lib/sse-hub';
import { optionalNumber } from '../../common/validate';

export function createNotificationRouter(notificationService: NotificationService): Router {
  const router = Router();

  /** SSE 实时推送：支持 ?token=<access_token> 与 Authorization: Bearer */
  router.get('/stream', async (req: Request, res: Response) => {
    const user = await authenticate(req);
    if (!user) {
      res.status(401).json({ error: 'invalid or expired token' });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const unsubscribe = sseHub.subscribe(user.accountId, res);
    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        /* 连接已断开 */
      }
    }, 30_000);

    req.on('close', () => {
      clearInterval(keepalive);
      unsubscribe();
    });
  });

  router.post('/list', requireAuth, async (req, res) => {
    const notifications = await notificationService.list(req.user!.accountId);
    res.json({ notifications });
  });

  router.post('/markRead', requireAuth, async (req, res) => {
    const id = optionalNumber(req.body, 'id', 0) || null;
    await notificationService.markRead(req.user!.accountId, id);
    res.json({ message: 'marked as read' });
  });

  router.post('/unreadCount', requireAuth, async (req, res) => {
    const count = await notificationService.unreadCount(req.user!.accountId);
    res.json({ count });
  });

  return router;
}
