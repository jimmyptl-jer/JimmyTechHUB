import express from 'express'
import { login, dashboard } from '../controllers/main.js'
import authMiddleware from '../middleware/auth.js'

const router = express.Router()

router.route('/dashboard').get(authMiddleware,dashboard)
router.route('/login').post(login)

export default router;