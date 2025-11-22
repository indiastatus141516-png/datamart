const mongoose = require('mongoose');

const purchaseRequestSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  dataRange: {
    startIndex: Number,
    endIndex: Number
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  category: {
    type: String,
    required: true
  },
  // New fields for weekly delivery system
  weekRange: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  dailyQuantities: {
    monday: { type: Number, default: 0 },
    tuesday: { type: Number, default: 0 },
    wednesday: { type: Number, default: 0 },
    thursday: { type: Number, default: 0 },
    friday: { type: Number, default: 0 }
  },
  // Track delivery progress
  deliveriesCompleted: {
    monday: { type: Boolean, default: false },
    tuesday: { type: Boolean, default: false },
    wednesday: { type: Boolean, default: false },
    thursday: { type: Boolean, default: false },
    friday: { type: Boolean, default: false }
  },
  nextDeliveryDate: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PurchaseRequest', purchaseRequestSchema);
