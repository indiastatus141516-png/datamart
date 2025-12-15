const cron = require('node-cron');
const mongoose = require('mongoose');
const UserAllocatedData = require('../models/UserAllocatedData');
const DailyRequirement = require('../models/DailyRequirement');
const PurchaseRequest = require('../models/PurchaseRequest');
const User = require('../models/User');
const { allocateDataItems } = require('./indexAllocationService');

class DailyAllocationService {
  constructor() {
    this.isRunning = false;
  }

  // Start the daily allocation scheduler
  start() {
    if (this.isRunning) {
      console.log('Daily allocation service is already running');
      return;
    }

    // Run every day at 9 AM (Monday to Friday)
    cron.schedule('0 9 * * 1-5', async () => {
      console.log('Running daily data allocation...');
      await this.allocateDailyData();
    }, {
      timezone: 'Asia/Kolkata'
    });

    this.isRunning = true;
    console.log('Daily allocation service started');
  }

  // Stop the scheduler
  stop() {
    this.isRunning = false;
    console.log('Daily allocation service stopped');
  }

  // Main allocation logic
  async allocateDailyData() {
    try {
      const today = new Date();
      const dayOfWeek = today.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

      // Only run Monday to Friday
      if (!['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(dayOfWeek)) {
        return;
      }

      console.log(`Allocating data for ${dayOfWeek}`);

      // Find all approved purchase requests that are still active
      // Sort by approvedAt ascending to ensure FIFO allocation among users
      const activeRequests = await PurchaseRequest.find({
        status: 'approved',
        'weekRange.startDate': { $lte: today },
        'weekRange.endDate': { $gte: today }
      }).sort({ approvedAt: 1 });

      let totalAllocations = 0;

      for (const request of activeRequests) {
        const quantity = request.dailyQuantities?.[dayOfWeek] || 0;

        if (quantity <= 0) continue;

        // Check if user already has allocation for today
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        const existingAllocation = await UserAllocatedData.findOne({
          userId: request.userId,
          category: request.category,
          dayOfWeek: dayOfWeek,
          date: { $gte: startOfDay, $lt: endOfDay }
        });

        if (existingAllocation) {
          console.log(`User ${request.userId} already has allocation for ${dayOfWeek}`);
          continue;
        }

        // Resolve user document to use real ObjectId for allocation
        let allocatedTo = null;
        try {
          const userDoc = await User.findOne({ userId: request.userId }).select('_id userId');
          if (userDoc && mongoose.isValidObjectId(userDoc._id)) {
            allocatedTo = userDoc._id;
          } else {
            console.error('DailyAllocation: cannot resolve mongo _id for', request.userId);
            continue;
          }
        } catch (e) {
          console.error('DailyAllocation: user lookup error', e && e.stack ? e.stack : e);
          continue;
        }

        // Allocate inventory directly from DataItem collection using index-based FIFO
        try {
          const allocated = await allocateDataItems(request.category, quantity, allocatedTo);

          if (allocated === null) {
            // Concurrency conflict detected — skip this user for now (can be retried later)
            console.warn(`Concurrency conflict while allocating for user ${request.userId} for ${request.category}`);
            continue;
          }

          if (!allocated || allocated.length === 0) {
            console.warn(`Insufficient data (DataItem) for ${request.category} on ${dayOfWeek}. Required: ${quantity}, Available: 0`);
            continue;
          }

          const allocation = new UserAllocatedData({
            userId: request.userId, // business ID string
            category: request.category,
            allocatedData: allocated,
            date: today,
            status: 'delivered',
            totalAllocated: allocated.length,
            purchaseRequestId: request._id,
            dayOfWeek: dayOfWeek
          });

          await allocation.save();

          totalAllocations++;
          console.log(`Allocated ${allocated.length} items to user ${request.userId} for ${request.category}`);
        } catch (e) {
          console.error('DailyAllocation: allocation error', e && e.stack ? e.stack : e);
          continue;
        }
      }

      console.log(`Daily allocation completed. Total allocations: ${totalAllocations}`);
    } catch (error) {
      console.error('Daily allocation error:', error && error.stack ? error.stack : error);
    }
  }

  // Manual trigger for testing
  async triggerManualAllocation() {
    console.log('Manually triggering daily allocation...');
    await this.allocateDailyData();
  }
}

module.exports = new DailyAllocationService();
