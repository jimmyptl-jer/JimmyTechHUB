import express, { json } from 'express';
import dotenv from 'dotenv'

import connectDB from './config/db.js'

dotenv.config()

import tasks from './routes/Routes.js'
const app = express()


//Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//routes
app.use('/api/tasks',tasks)

const PORT = 3000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`Server is listening on the port ${PORT}`));
};

startServer();
