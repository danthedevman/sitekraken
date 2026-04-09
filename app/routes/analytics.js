import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { dashboard, index, installation, toggleEnabled } from '../controllers/analyticsController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.get('/dashboard', ensureAuth, dashboard);
router.get('/installation', ensureAuth, installation);
router.post('/toggle-enabled', ensureAuth, toggleEnabled);

export default router;
