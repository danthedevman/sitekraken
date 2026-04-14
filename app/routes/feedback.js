import { Router } from 'express';

import { ensureAuth } from '../middleware/auth.js';
import {
  bulkDestroySubmissions,
  configuration,
  index,
  showSubmission,
  submissions,
  toggleEnabled,
  update
} from '../controllers/feedbackController.js';

const router = Router({ mergeParams: true });

router.get('/', ensureAuth, index);
router.get('/configuration', ensureAuth, configuration);
router.post('/', ensureAuth, update);
router.post('/toggle-enabled', ensureAuth, toggleEnabled);
router.get('/submissions', ensureAuth, submissions);
router.post('/submissions/bulk-delete', ensureAuth, bulkDestroySubmissions);
router.get('/submissions/:submissionId', ensureAuth, showSubmission);

export default router;
