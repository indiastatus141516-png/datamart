const mongoose = require('mongoose');

const dailyRequirementSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    index: true
  },
  dayOfWeek: {
    type: String,
    required: true,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    index: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  createdBy: {
    type: String,
    required: true // admin userId
  },
  uploadedData: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  }
  ,
  // Track per-purchase-request contributions so we can sum and decrement safely
  contributions: {
    type: [
      {
        purchaseRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequest' },
        userId: { type: String },
        quantity: { type: Number, default: 0 }
      }
    ],
    default: []
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
dailyRequirementSchema.index({ category: 1, date: 1 });
dailyRequirementSchema.index({ dayOfWeek: 1, date: 1 });

module.exports = mongoose.model('DailyRequirement', dailyRequirementSchema);
