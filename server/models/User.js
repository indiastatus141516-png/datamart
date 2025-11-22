const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'blocked'],
    default: 'pending'
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  profile: {
    firstName: String,
    lastName: String,
    company: String,
    phone: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
