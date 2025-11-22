const express = require('express');
const PurchaseRequest = require('../models/PurchaseRequest');
const Purchase = require('../models/Purchase');
const DataItem = require('../models/DataItem');
const User = require('../models/User');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const NodeCache = require('node-cache');

const router = express.Router();

// Initialize cache with 5 minutes TTL
const cache = new NodeCache({ stdTTL: 300 });

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create purchase request with transaction and caching
router.post('/request', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { category, quantity, weekRange, dailyQuantities } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!category || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Invalid request parameters' });
    }

    // Validate weekly delivery parameters
    if (!weekRange || !weekRange.startDate || !weekRange.endDate) {
      return res.status(400).json({ message: 'Week range is required' });
    }

    if (!dailyQuantities || typeof dailyQuantities !== 'object') {
      return res.status(400).json({ message: 'Daily quantities are required' });
    }

    // Calculate total quantity from daily quantities
    const totalDailyQuantity = Object.values(dailyQuantities).reduce((sum, qty) => sum + (qty || 0), 0);
    if (totalDailyQuantity !== quantity) {
      return res.status(400).json({
        message: 'Total daily quantities must equal the requested quantity',
        expected: quantity,
        actual: totalDailyQuantity
      });
    }

    // Resolve category to a category name if a fixed category ID or code was supplied
    const Category = require('../models/Category');
    let categoryName = category;

    try {
      // If client provided a Category document _id
      if (mongoose.Types.ObjectId.isValid(category)) {
        const catDoc = await Category.findById(category).session(session);
        if (catDoc) categoryName = catDoc.name;
      }

      // If client provided the category code (A,B,C...) or exact name
      if (!categoryName || typeof categoryName === 'string') {
        const byCode = await Category.findOne({ id: category }).session(session);
        if (byCode) categoryName = byCode.name;

        const byName = await Category.findOne({ name: categoryName }).session(session);
        if (byName) categoryName = byName.name; // ensure exact normalized name
      }
    } catch (err) {
      console.warn('Category resolution warning:', err.message);
    }

    // Note: Do not block request creation if there is currently insufficient uploaded data.
    // Users should be able to place requests even when admin hasn't uploaded data yet.
    // We still compute availableCount to include in the response or logs, but we won't reject the request.
    const availableCount = await DataItem.countDocuments({
      category: categoryName,
      status: 'available'
    }).session(session);

    // Create purchase request with weekly delivery info
    const request = new PurchaseRequest({
      userId,
      quantity,
      category,
      status: 'pending',
      weekRange: {
        startDate: new Date(weekRange.startDate),
        endDate: new Date(weekRange.endDate)
      },
      dailyQuantities: {
        monday: dailyQuantities.monday || 0,
        tuesday: dailyQuantities.tuesday || 0,
        wednesday: dailyQuantities.wednesday || 0,
        thursday: dailyQuantities.thursday || 0,
        friday: dailyQuantities.friday || 0
      },
      deliveriesCompleted: {
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: false,
        friday: false
      }
    });


    await request.save({ session });
    await session.commitTransaction();

    // Cache the request for 5 minutes
    cache.set(`request:${request._id}`, request.toJSON(), 300);

    res.status(201).json({ request, availableCount });
  } catch (error) {
    await session.abortTransaction();
    console.error('Purchase request error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// Get user's purchase requests
router.get('/requests', auth, async (req, res) => {
  try {
    const requests = await PurchaseRequest.find({ userId: req.user.userId });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's purchased data
router.get('/purchased', auth, async (req, res) => {
  try {
    const purchases = await Purchase.find({ userId: req.user.userId });
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate Razorpay order with improved validation and caching
router.post('/payment', auth, async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ message: 'Request ID is required' });
    }

    // Check cache first
    const cachedRequest = cache.get(`request:${requestId}`);
    const request = cachedRequest || await PurchaseRequest.findById(requestId)
      .select('userId category quantity status')
      .lean();

    if (!request) {
      return res.status(404).json({ message: 'Purchase request not found' });
    }

    if (request.userId !== req.user.userId) {
      return res.status(403).json({ message: 'Unauthorized access to purchase request' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        message: 'Request not approved',
        status: request.status
      });
    }

    // Create Razorpay order with fixed amount (since no price system)
    const options = {
      amount: 100, // Fixed amount of 1 INR (100 paisa) for demo purposes
      currency: 'INR',
      receipt: `receipt_${requestId}`,
      payment_capture: 1,
      notes: {
        userId: req.user.userId,
        category: request.category,
        quantity: request.quantity
      }
    };

    const order = await razorpay.orders.create(options);

    // Cache order details for 30 minutes
    cache.set(`order:${order.id}`, {
      requestId,
      amount: order.amount,
      userId: req.user.userId
    }, 1800);

    // Update request status to pending payment
    await PurchaseRequest.findByIdAndUpdate(requestId, { 
      status: 'payment_pending',
      razorpayOrderId: order.id
    });

    const response = {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      requestId: requestId,
      notes: options.notes
    };

    // Cache response for 5 minutes
    cache.set(`payment:${order.id}`, response, 300);

    res.json(response);
  } catch (error) {
    console.error('Payment creation error:', error);
    if (error.code === 'BAD_REQUEST_ERROR') {
      return res.status(400).json({ 
        message: 'Invalid payment request',
        details: error.message 
      });
    }
    res.status(500).json({ message: 'Failed to create payment order' });
  }
});

// Handle payment success with transaction management and optimizations
router.post('/payment/success', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId, paymentId, orderId, signature } = req.body;

    // Input validation
    if (!requestId || !paymentId || !orderId || !signature) {
      return res.status(400).json({ message: 'Missing required payment details' });
    }

    // Verify payment signature
    // Allow a demo bypass in non-production or when demo flag is passed.
    const allowDemo = (process.env.NODE_ENV !== 'production') || (process.env.ALLOW_DEMO_PAYMENTS === 'true') || req.body.demo === true;

    if (!allowDemo) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(orderId + '|' + paymentId)
        .digest('hex');

      if (signature !== expectedSignature) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Invalid payment signature' });
      }
    } else {
      // In demo mode we skip signature verification but still require the order to exist in cache
      console.warn('Payment signature verification skipped (demo mode)');
    }

    // Get cached order details
    const cachedOrder = cache.get(`order:${orderId}`);
    if (!cachedOrder || cachedOrder.userId !== req.user.userId) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid or expired order' });
    }

    // Find request with minimal projection
    const request = await PurchaseRequest.findById(requestId)
      .select('userId category quantity status')
      .session(session);

    if (!request) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status === 'completed') {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Payment already processed' });
    }

    // Allocate items in batches for large quantities
    const batchSize = 1000;
    const batches = Math.ceil(request.quantity / batchSize);
    const allItems = [];

    try {
      for (let i = 0; i < batches; i++) {
        const limit = Math.min(batchSize, request.quantity - (i * batchSize));

        // Find and update items atomically
        const items = await DataItem.find({
          category: request.category,
          status: 'available'
        })
        .limit(limit)
        .select('index category metadata')
        .session(session);

        if (items.length < limit) {
          throw new Error('Insufficient items available');
        }

        // Update status in batch
        const itemIds = items.map(item => item._id);
        await DataItem.updateMany(
          { _id: { $in: itemIds } },
          {
            status: 'sold',
            soldAt: new Date(),
            purchaseId: requestId
          },
          { session }
        );

        allItems.push(...items);
      }
    } catch (error) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Failed to allocate items',
        error: error.message
      });
    }

    // Create purchase record with all payment details
    const purchase = new Purchase({
      userId: request.userId,
      dataItems: allItems.map(item => ({
        index: item.index,
        category: item.category,
        metadata: item.metadata
      })),
      purchasedAt: new Date(),
      paymentStatus: 'completed',
      paymentId: paymentId,
      transactionDetails: {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature
      }
    });

    await purchase.save({ session });

    // Update request status and set up weekly delivery schedule
    request.status = 'completed';
    request.nextDeliveryDate = new Date(request.weekRange.startDate);
    await request.save({ session });

    // Schedule automatic daily deliveries starting from Monday
    setImmediate(async () => {
      try {
        const user = await User.findOne({ userId: request.userId }).select('email');

        if (user) {
          // Schedule daily deliveries
          scheduleWeeklyDeliveries(request, user);
        }
      } catch (error) {
        console.error('Delivery scheduling failed:', error);
        // Log to monitoring system but don't block transaction
      }
    });

    // Clear related caches
    cache.del(`request:${requestId}`);
    cache.del(`order:${orderId}`);
    cache.del(`payment:${orderId}`);
    
    await session.commitTransaction();

    res.json({
      message: 'Payment successful',
      purchase: {
        id: purchase._id,
        itemCount: allItems.length
      }
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Payment success error:', error);
    res.status(500).json({ 
      message: 'Payment processing failed',
      error: error.message
    });
  } finally {
    session.endSession();
  }
});

// Helper function to schedule weekly deliveries
async function scheduleWeeklyDeliveries(request, user) {
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  for (let i = 0; i < daysOfWeek.length; i++) {
    const day = daysOfWeek[i];
    const quantity = request.dailyQuantities[day];

    if (quantity > 0) {
      // Calculate delivery date (Monday + i days)
      const deliveryDate = new Date(request.weekRange.startDate);
      deliveryDate.setDate(deliveryDate.getDate() + i);

      // Schedule delivery for this day
      setTimeout(async () => {
        try {
          await processDailyDelivery(request, user, day, quantity, deliveryDate);
        } catch (error) {
          console.error(`Failed to process ${day} delivery for request ${request._id}:`, error);
        }
      }, (deliveryDate.getTime() - Date.now())); // Delay until delivery date
    }
  }
}

// Helper function to process daily delivery
async function processDailyDelivery(request, user, dayOfWeek, quantity, deliveryDate) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if delivery already completed
    const currentRequest = await PurchaseRequest.findById(request._id).session(session);
    if (currentRequest.deliveriesCompleted[dayOfWeek]) {
      await session.abortTransaction();
      return;
    }

    // Allocate items for this day's delivery
    const items = await DataItem.find({
      category: request.category,
      status: 'available'
    })
    .limit(quantity)
    .select('index category metadata')
    .session(session);

    if (items.length < quantity) {
      throw new Error(`Insufficient items available for ${dayOfWeek} delivery`);
    }

    // Update items status
    const itemIds = items.map(item => item._id);
    await DataItem.updateMany(
      { _id: { $in: itemIds } },
      {
        status: 'sold',
        soldAt: deliveryDate,
        purchaseId: request._id
      },
      { session }
    );

    // Create daily delivery record
    const dailyPurchase = new Purchase({
      userId: request.userId,
      dataItems: items.map(item => ({
        index: item.index,
        category: item.category,
        metadata: item.metadata
      })),
      purchasedAt: deliveryDate,
      paymentStatus: 'completed',
      paymentId: `weekly_${request._id}_${dayOfWeek}`,
      transactionDetails: {
        weeklyRequestId: request._id,
        dayOfWeek: dayOfWeek,
        deliveryDate: deliveryDate
      }
    });

    await dailyPurchase.save({ session });

    // Update request delivery status
    await PurchaseRequest.findByIdAndUpdate(
      request._id,
      {
        [`deliveriesCompleted.${dayOfWeek}`]: true,
        nextDeliveryDate: getNextDeliveryDate(request, dayOfWeek)
      },
      { session }
    );

    await session.commitTransaction();
    console.log(`Successfully delivered ${quantity} items for ${dayOfWeek} to user ${user.userId}`);

  } catch (error) {
    await session.abortTransaction();
    console.error(`Daily delivery failed for ${dayOfWeek}:`, error);
    // Could implement retry logic here
  } finally {
    session.endSession();
  }
}

// Helper function to get next delivery date
function getNextDeliveryDate(request, currentDay) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const currentIndex = days.indexOf(currentDay);

  if (currentIndex < days.length - 1) {
    const nextDate = new Date(request.weekRange.startDate);
    nextDate.setDate(nextDate.getDate() + currentIndex + 1);
    return nextDate;
  }

  return null; // No more deliveries this week
}

module.exports = router;
