const mongoose = require('mongoose');

const dataItemSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['available', 'allocated', 'sold', 'reserved'],
    default: 'available'
  },
  index: {
    type: Number,
    required: true,
    unique: true
  },
  allocatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  allocatedAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
dataItemSchema.index({ category: 1, status: 1 });
dataItemSchema.index({ status: 1, index: 1 });

module.exports = mongoose.model('DataItem', dataItemSchema);
