import { Router } from 'express';
import { home } from '../controllers/homeController.js';
import { ensureAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', ensureAuth,  (req,res)=>{
    return res.redirect("/analytics")
});

export default router;
