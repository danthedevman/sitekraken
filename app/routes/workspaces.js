import { Router } from 'express';
import { ensureAuth } from '../middleware/auth.js';
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

router.get('/', ensureAuth, (req,res)=>{
  res.redirect("/analytics");
});
router.get('/new', ensureAuth, newForm);
router.post('/', ensureAuth, create);
router.get('/:id', ensureAuth, show);
router.get('/:id/settings', ensureAuth, settingsForm);
router.put('/:id/settings', ensureAuth, updateSettings);
router.post('/:id/settings/members', ensureAuth, createMember);
router.put('/:id/settings/members/:memberUserId', ensureAuth, updateMember);
router.delete('/:id/settings/members/:memberUserId', ensureAuth, destroyMember);
router.delete('/:id', ensureAuth, destroy);

export default router;
