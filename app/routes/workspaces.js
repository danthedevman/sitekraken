import { Router } from 'express';
import { ensureAuth } from '../middleware/auth.js';
import { loadWorkspace } from '../middleware/workspace.js';
import {
  index,
  newForm,
  create,
  show,
  settingsForm,
  updateSettings,
  createMember,
  updateMember,
  destroyMember,
  destroy
} from '../controllers/workspaceController.js';

const router = Router();

router.get('/', ensureAuth, index);
router.get('/new', ensureAuth, newForm);
router.post('/', ensureAuth, create);
router.get('/:id', ensureAuth, loadWorkspace('id'), show);
router.get('/:id/settings', ensureAuth, loadWorkspace('id'), settingsForm);
router.put('/:id/settings', ensureAuth, loadWorkspace('id'), updateSettings);
router.post('/:id/settings/members', ensureAuth, loadWorkspace('id'), createMember);
router.put('/:id/settings/members/:memberUserId', ensureAuth, loadWorkspace('id'), updateMember);
router.delete('/:id/settings/members/:memberUserId', ensureAuth, loadWorkspace('id'), destroyMember);
router.delete('/:id', ensureAuth, loadWorkspace('id'), destroy);

export default router;
