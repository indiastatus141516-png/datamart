const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user exists and is approved
    const user = await User.findOne({ userId: decoded.userId });
    if (!user || user.status !== 'approved') {
      return res.status(403).json({ message: 'Access denied' });
    }

    req.user = user; // Store full user object
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const authProfile = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user exists
    const user = await User.findOne({ userId: decoded.userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user; // Store full user object
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = auth;
module.exports.authProfile = authProfile;
