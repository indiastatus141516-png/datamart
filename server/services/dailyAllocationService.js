const cron = require('node-cron');
const UserAllocatedData = require('../models/UserAllocatedData');
const DailyRequirement = require('../models/DailyRequirement');
const PurchaseRequest = require('../models/PurchaseRequest');
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
      timezone: "Asia/Kolkata" // Adjust timezone as needed
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
      const dayOfWeek = today.toLocaleLowerCase('en-US', { weekday: 'long' });

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
        const quantity = request.dailyQuantities[dayOfWeek];

        if (quantity > 0) {
          // Check if user already has allocation for today
          const existingAllocation = await UserAllocatedData.findOne({
            userId: request.userId,
            category: request.category,
            dayOfWeek: dayOfWeek,
            date: {
              $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
              $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
            }
          });

          if (existingAllocation) {
            console.log(`User ${request.userId} already has allocation for ${dayOfWeek}`);
            continue;
          }

          // Allocate inventory directly from DataItem collection using index-based FIFO
          // allocateDataItems will pick lowest `index` available items and mark them allocated atomically.
          const allocated = await allocateDataItems(request.category, quantity, request.userId);

          if (allocated === null) {
            // Concurrency conflict detected — skip this user for now (can be retried later)
            console.warn(`Concurrency conflict while allocating for user ${request.userId} for ${request.category}`);
            continue;
          }

          if (allocated.length === 0) {
            console.warn(`Insufficient data (DataItem) for ${request.category} on ${dayOfWeek}. Required: ${quantity}, Available: 0`);
            continue;
          }

          const allocation = new UserAllocatedData({
            userId: request.userId,
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
        }
      }

      console.log(`Daily allocation completed. Total allocations: ${totalAllocations}`);
    } catch (error) {
      console.error('Daily allocation error:', error);
    }
  }

  // Manual trigger for testing
  async triggerManualAllocation() {
    console.log('Manually triggering daily allocation...');
    await this.allocateDailyData();
  }
}

module.exports = new DailyAllocationService();
