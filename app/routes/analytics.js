import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { index } from '../controllers/analyticsController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);

export default router;
