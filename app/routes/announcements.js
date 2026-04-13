import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { index, update } from '../controllers/announcementsController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/', ensureAuth, update);

export default router;
