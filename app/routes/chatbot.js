import { Router } from 'express';
import { ensureAuth } from '../middleware/auth.js';
import {
  index,
  update,
  regenerateApiKey
} from '../controllers/chatbotController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/', ensureAuth, update);
router.post('/regenerate-key', ensureAuth, regenerateApiKey);

export default router;