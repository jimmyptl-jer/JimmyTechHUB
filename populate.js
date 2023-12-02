import dotenv from 'dotenv'

dotenv.config();

import connectDB from "./config/db.js";
import Product from "./models/product.js";

// Specify import assertion for JSON file
import jsonProduct from './products.json' assert { type: 'json' };

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    await Product.deleteMany()
    await Product.create(jsonProduct)

    console.log("Success!!!")
    process.exit(0)
    // Now you can use jsonProduct in your code
  } catch (error) {
    console.log(error);
    process.exit(1)
  }
}

start();
