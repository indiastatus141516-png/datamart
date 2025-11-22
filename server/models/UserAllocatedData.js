const mongoose = require('mongoose');

const userAllocatedDataSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  allocatedData: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'allocated', 'delivered'],
    default: 'pending'
  },
  totalAllocated: {
    type: Number,
    default: 0
  },
  purchaseRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseRequest',
    required: true
  },
  dayOfWeek: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    required: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
userAllocatedDataSchema.index({ userId: 1, date: 1 });
userAllocatedDataSchema.index({ category: 1, date: 1 });
userAllocatedDataSchema.index({ purchaseRequestId: 1, dayOfWeek: 1 });

module.exports = mongoose.model('UserAllocatedData', userAllocatedDataSchema);
