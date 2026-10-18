import { Router } from 'express';
import multer from 'multer';
import { AccountService } from './account.service';
import { requireAuth } from '../../middleware/auth';
import { rateLimit } from '../../middleware/rate-limit';
import { optionalString, requireNumber, requireString } from '../../common/validate';
import { badRequest } from '../../common/errors';
import { saveAvatar } from '../../lib/uploads';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function createAccountRouter(accountService: AccountService): Router {
  const router = Router();

  router.post('/register', rateLimit('register', 5, 3600_000, 'ip'), async (req, res) => {
    const username = requireString(req.body, 'username', 50);
    const password = requireString(req.body, 'password', 100);
    await accountService.register(username, password);
    res.json({ message: 'account created' });
  });

  router.post('/login', rateLimit('login', 10, 60_000, 'ip'), async (req, res) => {
    const username = requireString(req.body, 'username', 50);
    const password = requireString(req.body, 'password', 100);
    res.json(await accountService.login(username, password));
  });

  router.post('/refresh', async (req, res) => {
    const refreshToken = requireString(req.body, 'refresh_token', 200);
    res.json(await accountService.refresh(refreshToken));
  });

  router.post('/changePassword', async (req, res) => {
    const username = requireString(req.body, 'username', 50);
    const oldPassword = requireString(req.body, 'old_password', 100);
    const newPassword = requireString(req.body, 'new_password', 100);
    await accountService.changePassword(username, oldPassword, newPassword);
    res.json({ message: 'password changed' });
  });

  router.post('/findByID', async (req, res) => {
    const id = requireNumber(req.body, 'id');
    res.json(await accountService.findByID(id));
  });

  router.post('/findByUsername', async (req, res) => {
    const username = requireString(req.body, 'username', 50);
    res.json(await accountService.findByUsername(username));
  });

  router.post('/getProfile', async (req, res) => {
    const accountId = requireNumber(req.body, 'account_id');
    res.json(await accountService.getProfile(accountId));
  });

  router.post('/logout', requireAuth, async (req, res) => {
    await accountService.logout(req.user!.accountId);
    res.json({ message: 'logged out' });
  });

  router.post('/rename', requireAuth, async (req, res) => {
    const newUsername = requireString(req.body, 'new_username', 50);
    const token = await accountService.rename(req.user!.accountId, newUsername);
    res.json({ token });
  });

  router.post('/uploadAvatar', requireAuth, avatarUpload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('file is required');
    const accountId = req.user!.accountId;
    const avatarUrl = saveAvatar(accountId, file.originalname, file.buffer);
    await accountService.updateAvatar(accountId, avatarUrl);
    res.json({ avatar_url: avatarUrl });
  });

  router.post('/updateProfile', requireAuth, async (req, res) => {
    const avatarUrl = optionalString(req.body, 'avatar_url', 512);
    const bio = optionalString(req.body, 'bio', 255);
    await accountService.updateProfile(req.user!.accountId, avatarUrl, bio);
    res.json({ message: 'profile updated' });
  });

  return router;
}
