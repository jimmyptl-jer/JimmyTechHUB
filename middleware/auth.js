import jwt from "jsonwebtoken"
import CustomAPIError from "../errors/custom-error.js"


const authMiddleware = async (req, res, next) => {

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new CustomAPIError("Invalid Token", 401);
  }

  const token = authHeader && authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const{username} = decoded
    req.user = {username}

  } catch (error) {
    throw new CustomAPIError("Unauthorized Access", 401);
  }

  next()
}

export default authMiddleware