import express from 'express'
import Task from '../models/Model.js'

import { createTask, deleteTask, getAllTask, getTask, updateTask } from '../controller/Controller.js'

const router = express.Router()

router.route('/').get(getAllTask)
router.route('/').post(createTask)
router.route('/:id').get(getTask).patch(updateTask).delete(deleteTask)


export default router