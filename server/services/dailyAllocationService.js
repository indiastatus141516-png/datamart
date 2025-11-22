const cron = require('node-cron');
const UserAllocatedData = require('../models/UserAllocatedData');
const DailyRequirement = require('../models/DailyRequirement');
const PurchaseRequest = require('../models/PurchaseRequest');

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
      const activeRequests = await PurchaseRequest.find({
        status: 'approved',
        'weekRange.startDate': { $lte: today },
        'weekRange.endDate': { $gte: today }
      });

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

          // Find available data for this category and day
          const requirement = await DailyRequirement.findOne({
            category: request.category,
            dayOfWeek: dayOfWeek,
            date: {
              $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
              $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
            }
          });

          if (requirement && requirement.uploadedData && requirement.uploadedData.length >= quantity) {
            // Allocate data
            const allocatedData = requirement.uploadedData.splice(0, quantity);

            const allocation = new UserAllocatedData({
              userId: request.userId,
              category: request.category,
              allocatedData: allocatedData,
              date: today,
              status: 'delivered',
              totalAllocated: quantity,
              purchaseRequestId: request._id,
              dayOfWeek: dayOfWeek
            });

            await allocation.save();
            await requirement.save();

            totalAllocations++;
            console.log(`Allocated ${quantity} items to user ${request.userId} for ${request.category}`);
          } else {
            console.warn(`Insufficient data for ${request.category} on ${dayOfWeek}. Required: ${quantity}, Available: ${requirement?.uploadedData?.length || 0}`);
          }
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
