import express, { json } from 'express';
import dotenv from 'dotenv'
import 'express-async-errors'

import { notFound } from './middleware/not-found.js';
import { errorHandlerMiddleware } from './middleware/error-handler.js';
import product from './routes/products.js'
import connectDB from './config/db.js'

dotenv.config()

const app = express()


//Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Routes
app.use('/api/store', product);


// Custom Middleware
app.use(notFound);
app.use(errorHandlerMiddleware);

app.get('/',(req,res)=>{
  res.send("Server is ready")
})

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`Server is listening on the port ${PORT}...`));
  } catch (error) {
    console.error('Error starting the server:', error.message);
    process.exit(1); // Exit the Node.js process with a non-zero exit code to indicate an error
  }
};

startServer();
