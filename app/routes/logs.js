import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import { bulkDestroy, index, show, toggleEnabled } from '../controllers/logsController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.post('/toggle-enabled', ensureAuth, toggleEnabled);
router.post('/bulk-delete', ensureAuth, bulkDestroy);
router.get('/:logId', ensureAuth, show);

export default router;
