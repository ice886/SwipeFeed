import { Router } from 'express';
import { MessageService } from './message.service';
import { requireAuth } from '../../middleware/auth';
import { requireNumber, requireString } from '../../common/validate';

export function createMessageRouter(messageService: MessageService): Router {
  const router = Router();

  router.post('/send', requireAuth, async (req, res) => {
    const toId = requireNumber(req.body, 'to_id');
    const content = requireString(req.body, 'content', 2000);
    const message = await messageService.send(req.user!.accountId, toId, content);
    res.json({ message });
  });

  router.post('/list', requireAuth, async (req, res) => {
    const peerId = requireNumber(req.body, 'peer_id');
    res.json(await messageService.list(req.user!.accountId, peerId));
  });

  return router;
}
