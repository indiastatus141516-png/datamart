const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const DataItem = require('../models/DataItem');
const { importFromGoogleSheets, getSpreadsheetInfo } = require('../services/googleSheetsService');
const auth = require('../middleware/auth');
const dailyAllocationService = require('../services/dailyAllocationService');

const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload and parse Excel data
router.post('/upload', requireAdmin, upload.fields([{ name: 'file' }, { name: 'categoryId' }, { name: 'category' }, { name: 'dayOfWeek' }, { name: 'date' }]), async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    // Accept either categoryId (A/B/C...) or category name
    const { categoryId, category, dayOfWeek, date } = req.body;
    const Category = require('../models/Category');

    let categoryDoc = null;
    if (categoryId) {
      categoryDoc = await Category.findOne({ id: categoryId });
    } else if (category) {
      categoryDoc = await Category.findOne({ name: category });
    }

    if (!categoryDoc) {
      return res.status(404).json({ message: 'Category not found. Please set a name for this category first.' });
    }

    // Parse Excel file
    const workbook = xlsx.read(req.files.file[0].buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      return res.status(400).json({ message: 'Excel file is empty or invalid' });
    }

    // If dayOfWeek and date are provided, append rows to DailyRequirement.uploadedData
    if (dayOfWeek && date) {
      try {
        const DailyRequirement = require('../models/DailyRequirement');
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        if (!validDays.includes(dayOfWeek.toLowerCase())) {
          return res.status(400).json({ message: 'Invalid dayOfWeek. Use monday..friday' });
        }

        const normalizedDate = new Date(date);
        normalizedDate.setHours(0,0,0,0);

        // Upsert and push uploaded rows into uploadedData
        const requirement = await DailyRequirement.findOneAndUpdate(
          { category: categoryDoc.name, dayOfWeek: dayOfWeek.toLowerCase(), date: normalizedDate },
          { $push: { uploadedData: { $each: jsonData } }, $setOnInsert: { createdBy: req.user.userId } },
          { upsert: true, new: true }
        );

        // If requirement has a quantity and we now meet or exceed it, trigger allocation for today
        try {
          if (requirement && typeof requirement.quantity === 'number' && requirement.quantity > 0) {
            const uploadedCount = Array.isArray(requirement.uploadedData) ? requirement.uploadedData.length : 0;
            if (uploadedCount >= requirement.quantity) {
              // Trigger allocation service to allocate for users (best-effort)
              await dailyAllocationService.triggerManualAllocation();
            }
          }
        } catch (allocErr) {
          console.error('Allocation trigger error:', allocErr);
        }

        return res.json({ message: `${jsonData.length} rows appended to daily requirement for ${categoryDoc.name} on ${dayOfWeek} ${date}`, requirement });
      } catch (err) {
        console.error('Daily requirement append error:', err);
        return res.status(500).json({ message: 'Failed to append to daily requirement' });
      }
    }

    // No specific day/date: fall back to legacy DataItem insertion
    // Get the last index to continue numbering
    const lastItem = await DataItem.findOne().sort({ index: -1 });
    let nextIndex = lastItem ? lastItem.index + 1 : 1;

    // Process and save data items
    const dataItems = jsonData.map((row, idx) => {
      return {
        category: categoryDoc.name,
        status: 'available',
        index: nextIndex++,
        metadata: row // Store all row data as metadata
      };
    });

    await DataItem.insertMany(dataItems);

    res.json({
      message: `${dataItems.length} data items uploaded successfully for category ${categoryId} (${categoryDoc.name})`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: `Failed to upload data: ${error.message}` });
  }
});

// Get available data categories and counts
router.get('/categories', auth, async (req, res) => {
  try {
    // Return a union of fixed categories (from Category collection) and dynamic categories (from DataItem)
    const fixedCategories = await require('../models/Category').find().sort({ id: 1 });

    const dynamicCategories = await DataItem.find({ status: 'available' }).distinct('category');

    const categoryDataMap = new Map();

    // Add fixed categories (with id and name)
    fixedCategories.forEach(cat => {
      categoryDataMap.set(cat.name, {
        _id: cat._id,
        name: cat.name,
        id: cat.id,
        count: 0
      });
    });

    // Add counts from dynamic categories
    for (const category of dynamicCategories) {
      const count = await DataItem.countDocuments({ category, status: 'available' });
      if (categoryDataMap.has(category)) {
        const existing = categoryDataMap.get(category);
        existing.count = count;
        categoryDataMap.set(category, existing);
      } else {
        categoryDataMap.set(category, {
          _id: category,
          name: category,
          id: null,
          count
        });
      }
    }

    const categoryData = Array.from(categoryDataMap.values());
    res.json(categoryData);
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get data preview (first few available items per category)
router.get('/preview/:category', auth, async (req, res) => {
  try {
    const items = await DataItem.find({
      category: req.params.category,
      status: 'available'
    }).limit(5);

    if (!items || items.length === 0) {
      return res.status(404).json({ message: 'No items found in this category' });
    }

    res.json(items);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Import data from Google Sheets
router.post('/import-sheets', requireAdmin, async (req, res) => {
  try {
    const { spreadsheetId, range } = req.body;

    if (!spreadsheetId || !range) {
      return res.status(400).json({ message: 'Spreadsheet ID and range are required' });
    }

    const result = await importFromGoogleSheets(spreadsheetId, range);
    res.json(result);
  } catch (error) {
    console.error('Google Sheets import error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get Google Sheets information
router.get('/sheets-info/:spreadsheetId', requireAdmin, async (req, res) => {
  try {
    const { spreadsheetId } = req.params;

    if (!spreadsheetId) {
      return res.status(400).json({ message: 'Spreadsheet ID is required' });
    }

    const info = await getSpreadsheetInfo(spreadsheetId);
    res.json(info);
  } catch (error) {
    console.error('Google Sheets info error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

// User-facing endpoint: get daily requirements for current week (includes uploaded counts)
router.get('/daily-requirements', auth, async (req, res) => {
  try {
    const today = new Date();
    // Compute current week's Monday (treat Sunday as previous week's Monday)
    const day = today.getDay(); // 0 (Sun) - 6 (Sat)
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0,0,0,0);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23,59,59,999);

    const requirementsData = await require('../models/DailyRequirement').find({
      date: {
        $gte: monday,
        $lte: friday
      }
    }).sort({ category: 1, date: 1 });

    const requirements = {};
    const grandTotal = { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, total: 0 };

    requirementsData.forEach(r => {
      const cat = r.category;
      if (!requirements[cat]) {
        requirements[cat] = { monday: { required: 0, uploaded: 0 }, tuesday: { required: 0, uploaded: 0 }, wednesday: { required: 0, uploaded: 0 }, thursday: { required: 0, uploaded: 0 }, friday: { required: 0, uploaded: 0 }, total: 0 };
      }

      const day = r.dayOfWeek;
      const qty = r.quantity || 0;
      const uploaded = Array.isArray(r.uploadedData) ? r.uploadedData.length : 0;

      requirements[cat][day] = { required: qty, uploaded };
      requirements[cat].total += qty;
    });

    Object.values(requirements).forEach(cat => {
      grandTotal.monday += cat.monday.required || 0;
      grandTotal.tuesday += cat.tuesday.required || 0;
      grandTotal.wednesday += cat.wednesday.required || 0;
      grandTotal.thursday += cat.thursday.required || 0;
      grandTotal.friday += cat.friday.required || 0;
      grandTotal.total += cat.total || 0;
    });

    // Format dates
    const formatDate = (date) => {
      const d = date.getDate().toString().padStart(2, '0');
      const m = (date.getMonth() + 1).toString().padStart(2, '0');
      const y = date.getFullYear().toString().slice(-2);
      return `${d}/${m}/${y}`;
    };

    const dates = {
      monday: formatDate(monday),
      tuesday: formatDate(new Date(monday.getTime() + 1 * 24 * 60 * 60 * 1000)),
      wednesday: formatDate(new Date(monday.getTime() + 2 * 24 * 60 * 60 * 1000)),
      thursday: formatDate(new Date(monday.getTime() + 3 * 24 * 60 * 60 * 1000)),
      friday: formatDate(friday)
    };

    res.json({ dates, requirements, grandTotal });
  } catch (error) {
    console.error('Get daily requirements (user) error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User-facing endpoint: get uploaded data for a category on a specific day/date
router.get('/daily-data', auth, async (req, res) => {
  try {
    const { category, dayOfWeek, date } = req.query;
    if (!category || !dayOfWeek || !date) return res.status(400).json({ message: 'category, dayOfWeek and date are required' });

    const reqDate = new Date(date);
    const DailyRequirement = require('../models/DailyRequirement');
    const requirement = await DailyRequirement.findOne({
      category,
      dayOfWeek: dayOfWeek.toLowerCase(),
      date: {
        $gte: new Date(reqDate.setHours(0,0,0,0)),
        $lte: new Date(reqDate.setHours(23,59,59,999))
      }
    });

    if (!requirement || !Array.isArray(requirement.uploadedData) || requirement.uploadedData.length === 0) {
      return res.status(404).json({ message: 'No uploaded data found for this category/day' });
    }

    res.json({ uploadedData: requirement.uploadedData });
  } catch (error) {
    console.error('Get daily uploaded data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
