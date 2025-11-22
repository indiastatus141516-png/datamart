const express = require('express');
const xlsx = require('xlsx');
const UserAllocatedData = require('../models/UserAllocatedData');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user's allocated data
router.get('/allocated', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all allocated data for the user
    const allocatedData = await UserAllocatedData.find({
      userId: userId,
      status: { $in: ['allocated', 'delivered'] }
    }).sort({ date: -1 });

    // Group by category and date
    const groupedData = {};
    allocatedData.forEach(allocation => {
      const key = `${allocation.category}_${allocation.date.toISOString().split('T')[0]}`;
      if (!groupedData[key]) {
        groupedData[key] = {
          category: allocation.category,
          date: allocation.date,
          dayOfWeek: allocation.dayOfWeek,
          totalAllocated: 0,
          data: []
        };
      }
      groupedData[key].totalAllocated += allocation.totalAllocated;
      groupedData[key].data.push(...allocation.allocatedData);
    });

    res.json(Object.values(groupedData));
  } catch (error) {
    console.error('Get allocated data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get allocated data for specific category and date
router.get('/allocated/:category/:date', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, date } = req.params;

    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const allocations = await UserAllocatedData.find({
      userId: userId,
      category: category,
      date: { $gte: startDate, $lt: endDate },
      status: { $in: ['allocated', 'delivered'] }
    });

    if (allocations.length === 0) {
      return res.status(404).json({ message: 'No allocated data found for this date' });
    }

    // Combine all data from allocations
    const combinedData = [];
    allocations.forEach(allocation => {
      combinedData.push(...allocation.allocatedData);
    });

    res.json({
      category: category,
      date: date,
      totalItems: combinedData.length,
      data: combinedData
    });
  } catch (error) {
    console.error('Get allocated data by date error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Download allocated data as Excel
router.get('/download/:category/:date', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category, date } = req.params;

    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const allocations = await UserAllocatedData.find({
      userId: userId,
      category: category,
      date: { $gte: startDate, $lt: endDate },
      status: { $in: ['allocated', 'delivered'] }
    });

    if (allocations.length === 0) {
      return res.status(404).json({ message: 'No allocated data found for this date' });
    }

    // Combine all data from allocations
    const combinedData = [];
    allocations.forEach(allocation => {
      combinedData.push(...allocation.allocatedData);
    });

    // Create Excel file
    const worksheet = xlsx.utils.json_to_sheet(combinedData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, category);

    // Generate buffer
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${category}_${date}.xlsx"`);

    res.send(buffer);
  } catch (error) {
    console.error('Download allocated data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
