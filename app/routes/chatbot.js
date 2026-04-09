import { Router } from 'express';
import multer from 'multer';

import { ensureAuth } from '../middleware/auth.js';
import fileRoutes from './files.js';
import knowledgeRoutes from './knowledge.js';
import {
  index,
  interactions,
  showInteraction,
  update,
  regenerateApiKey
} from '../controllers/chatbotController.js';

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

router.get('/', ensureAuth, index);
router.post('/', ensureAuth, upload.single('logo'), update);
router.get('/interactions', ensureAuth, interactions);
router.get('/interactions/:threadId', ensureAuth, showInteraction);
router.post('/regenerate-key', ensureAuth, regenerateApiKey);
router.use('/files', fileRoutes);
router.use('/knowledge', knowledgeRoutes);

export default router;
