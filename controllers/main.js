import jwt from 'jsonwebtoken'
import CustomAPIError from "../errors/custom-error.js";

export const login = async (req, res) => {
  const { username, password } = req.body

  console.log(`Username is ${username}`);
  console.log(`Password is ${password}`)

  if (!username || !password) {
    throw new CustomAPIError('Please provide valid password and username')
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '30d' })
  res.status(200).json({ msg: 'User Created', token: token })
}

export const dashboard = async (req, res) => {
  console.log(req.user)
  const username = req.user.username
  const randomNumber = Math.floor(Math.random() * 100);

  res.status(200).json({
    msg: `Hello,${username}`,
    secret: `Here is your authorized data, you can use the given number to login ${randomNumber}`
  });
};
