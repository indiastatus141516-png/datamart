// Simple revenue check script - run with `node tools/revenue_check.js`
// Connects to the same Mongo used by the app via mongoose (assumes .env and server.js connection code exist)

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Purchase = require('../models/Purchase');
const PurchaseRequest = require('../models/PurchaseRequest');

dotenv.config();

async function run() {
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/crm';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });

  const totalAgg = await Purchase.aggregate([
    { $match: { paymentStatus: 'completed' } },
    { $group: { _id: null, total: { $sum: '$totalPrice' } } }
  ]);

  const committedAgg = await PurchaseRequest.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$price' } } }
  ]);

  const pendingCount = await PurchaseRequest.countDocuments({ status: 'pending' });

  const realized = totalAgg[0]?.total || 0;
  const committed = committedAgg[0]?.total || 0;

  console.log('Realized revenue: ', realized);
  console.log('Committed revenue:', committed);
  console.log('Pending requests:  ', pendingCount);

  if (committed > realized * 2 && committed > 0) {
    console.warn('ALERT: Committed revenue is more than twice realized revenue.');
  }

  if (pendingCount > 1000) {
    console.error('CRITICAL: Very high pending requests - investigate.');
  }

  mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
