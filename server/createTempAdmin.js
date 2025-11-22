const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createTempAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm');

    // Check if temp admin already exists
    const existingTempAdmin = await User.findOne({ email: 'tempadmin@datamartx.com' });
    if (existingTempAdmin) {
      console.log('Temp admin already exists.');
      console.log('Email: tempadmin@datamartx.com');
      console.log('Password: tempadmin123');
      await mongoose.disconnect();
      return;
    }

    const hashedPassword = await bcrypt.hash('tempadmin123', 10);
    const userId = 'tempadmin_' + Date.now();

    const tempAdmin = new User({
      userId,
      email: 'tempadmin@datamartx.com',
      password: hashedPassword,
      status: 'approved',
      role: 'admin',
      requestedAt: new Date()
    });

    await tempAdmin.save();

    console.log('Temporary admin created successfully.');
    console.log('Email: tempadmin@datamartx.com');
    console.log('Password: tempadmin123');
    console.log('Use this to log in and unblock the main admin account.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error creating temp admin:', error);
  }
}

createTempAdmin();
