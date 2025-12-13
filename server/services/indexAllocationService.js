const mongoose = require('mongoose');
const DataItem = require('../models/DataItem');

/**
 * Allocate lowest-index available DataItems for a category to a user.
 * - Follows FIFO by sorting by `index: 1`.
 * - Uses an external session if provided; otherwise creates its own transaction.
 * - Marks items as status: 'allocated', sets `allocatedTo` and `allocatedAt`.
 * - Returns allocated items (full documents) or null on concurrency conflict.
 *
 * Params:
 *  - category: category id/string
 *  - quantity: number
 *  - userId: ObjectId or string
 *  - session: optional mongoose session
 */
async function allocateDataItems(category, quantity, userId, session = null) {
  const externalSession = !!session;
  if (!externalSession) {
    session = await DataItem.startSession();
    session.startTransaction();
  }

  try {
    // Find lowest-index available items for the category
    const items = await DataItem.find({ category, status: 'available' })
      .sort({ index: 1 })
      .limit(quantity)
      .session(session)
      .lean();

    if (!items || items.length === 0) {
      if (!externalSession) {
        await session.abortTransaction();
        session.endSession();
      }
      return [];
    }

    const ids = items.map(i => i._id);

    // Atomically update only those still available (prevent race)
    const res = await DataItem.updateMany(
      { _id: { $in: ids }, status: 'available' },
      { $set: { status: 'allocated', allocatedTo: mongoose.Types.ObjectId(userId), allocatedAt: new Date() } }
    ).session(session);

    // If some items were already taken by concurrent allocators, abort/indicate conflict
    if (res.matchedCount !== ids.length) {
      // Concurrency conflict: abort and return null to signal caller to retry
      if (!externalSession) {
        await session.abortTransaction();
        session.endSession();
      }
      return null;
    }

    // Commit if we started the transaction
    if (!externalSession) {
      await session.commitTransaction();
    }

    // Read the allocated items (reflects allocatedTo/status)
    const allocated = await DataItem.find({ _id: { $in: ids } }).session(externalSession ? session : null).lean();

    if (!externalSession) {
      session.endSession();
    }

    // Normalize returned allocated data for UserAllocatedData.storage
    return allocated.map(it => ({ dataItemId: it._id, index: it.index, metadata: it.metadata }));
  } catch (err) {
    if (!externalSession && session) {
      try { await session.abortTransaction(); } catch (e) {}
      session.endSession();
    }
    throw err;
  }
}

module.exports = { allocateDataItems };
