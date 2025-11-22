const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');

    const newPassword = 'admin1234'; // New password provided by user
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await User.findOneAndUpdate(
      { email: 'admin12@datamartx.com' },
      { password: hashedPassword },
      { new: true }
    );

    if (result) {
      console.log('Admin password reset successfully.');
      console.log('Email: admin@datamartx.com');
      console.log('New Password: admin1436');
    } else {
      console.log('Admin user not found.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error resetting admin password:', error);
  }
}

resetAdminPassword();
