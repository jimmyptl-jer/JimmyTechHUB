import dotenv from 'dotenv'
import expressError from 'express-async-errors'
import express from 'express'

import mainRoute from './routes/main.js'
import notFoundMiddleware from './middleware/not-found.js'
import errorHandlerMiddleware from './middleware/error-handler.js'

dotenv.config()

const app = express();


// middleware
app.use(express.static('./public'));
app.use(express.json());
app.use(express.urlencoded())

app.use('/api/',mainRoute)

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

const port = process.env.PORT || 3000;

const start = async () => {
  try {
    app.listen(port, () =>
      console.log(`Server is listening on port ${port}...`)
    );
  } catch (error) {
    console.log(error);
  }
};

start();
