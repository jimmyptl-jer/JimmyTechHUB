import mongoose from "mongoose";

const product = new mongoose.Schema({
  name:{
    type:String,
    required:[true,"Product name is required"],
  },
  price:{
    type:Number,
    required:[true,"Product price is required"],
  },
  feature:{
    type:Boolean,
    default:false
  },
  rating:{
    type:Number,
    default:4.5
  },
  createdAt:{
    type:Date,
    default:Date.now()
  },
  company:{
    type:String,
    enum:{
      values: ['ikea','liddy','caressa','marcos'],
      message:'{VALUES} is not supported'
    }
    
  }
})

const Product = mongoose.model('Product',product)

export default Product
