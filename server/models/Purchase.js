const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true // Add index for faster queries
  },
  dataItems: [{
    index: Number,
    category: String,
    metadata: mongoose.Schema.Types.Mixed
  }],
  purchasedAt: {
    type: Date,
    default: Date.now,
    index: true // Add index for date-based queries
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
    index: true // Add index for payment status queries
  },
  paymentId: {
    type: String,
    sparse: true // Sparse index since it's optional
  },
  transactionDetails: {
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String
  }
}, {
  timestamps: true,
  toJSON: { getters: true } // Enable getter functions
});

module.exports = mongoose.model('Purchase', purchaseSchema);
