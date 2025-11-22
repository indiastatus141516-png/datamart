const { google } = require('googleapis');
const DataItem = require('../models/DataItem');

// Initialize Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// Import data from Google Sheets
const importFromGoogleSheets = async (spreadsheetId, range) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      throw new Error('No data found in the specified range');
    }

    // Get the last index to continue numbering
    const lastItem = await DataItem.findOne().sort({ index: -1 });
    let nextIndex = lastItem ? lastItem.index + 1 : 1;

    // Extract headers from first row
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Process and save data items
    const dataItems = dataRows.map((row, idx) => {
      // Create metadata object from headers and row data
      const metadata = {};
      headers.forEach((header, colIdx) => {
        metadata[header] = row[colIdx] || '';
      });

      // Map common column names to expected fields
      const category = metadata.category || metadata.Product_Category || metadata.Category || metadata.CATEGORY || 'Uncategorized';

      return {
        category: category,
        status: 'available',
        index: nextIndex++,
        metadata: metadata
      };
    });

    await DataItem.insertMany(dataItems);

    return {
      success: true,
      message: `${dataItems.length} data items imported successfully from Google Sheets`,
      count: dataItems.length
    };
  } catch (error) {
    console.error('Google Sheets import error:', error);
    throw new Error(`Failed to import from Google Sheets: ${error.message}`);
  }
};

// Get spreadsheet metadata
const getSpreadsheetInfo = async (spreadsheetId) => {
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheets = response.data.sheets.map(sheet => ({
      title: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      rowCount: sheet.properties.gridProperties.rowCount,
      columnCount: sheet.properties.gridProperties.columnCount,
    }));

    return {
      title: response.data.properties.title,
      sheets: sheets
    };
  } catch (error) {
    console.error('Google Sheets info error:', error);
    throw new Error(`Failed to get spreadsheet info: ${error.message}`);
  }
};

module.exports = {
  importFromGoogleSheets,
  getSpreadsheetInfo
};
