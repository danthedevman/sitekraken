import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { index, toggleEnabled } from '../controllers/analyticsController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/toggle-enabled', ensureAuth, toggleEnabled);

export default router;
