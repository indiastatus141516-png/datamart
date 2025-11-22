const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get own profile
router.get('/me', auth.authProfile, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.userId }).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile (requires admin access)
router.get('/:userId', auth, async (req, res) => {
  try {
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { userId } = req.params;
    const user = await User.findOne({ userId }).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update own profile (automatic save)
router.put('/me', auth.authProfile, async (req, res) => {
  try {
    const { profile, email } = req.body;
    
    // Validate email if provided
    if (email) {
      const existingUser = await User.findOne({ email, userId: { $ne: req.user.userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const updateData = {};
    if (email) updateData.email = email;
    
    // Merge existing profile with new profile data
    if (profile) {
      updateData.profile = {
        ...req.user.profile,
        ...profile,
        address: {
          ...(req.user.profile?.address || {}),
          ...(profile.address || {})
        }
      };
    }

    const user = await User.findOneAndUpdate(
      { userId: req.user.userId },
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile (admin access)
router.put('/:userId', auth, async (req, res) => {
  try {
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { userId } = req.params;
    const { profile, email, status } = req.body;

    // Validate email if provided
    if (email) {
      const existingUser = await User.findOne({ email, userId: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const existingUser = await User.findOne({ userId });
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updateData = {};
    if (email) updateData.email = email;
    if (status) updateData.status = status;
    
    // Handle profile update
    if (profile) {
      updateData.profile = {
        firstName: profile.firstName || existingUser.profile?.firstName,
        lastName: profile.lastName || existingUser.profile?.lastName,
        company: profile.company || existingUser.profile?.company,
        phone: profile.phone || existingUser.profile?.phone,
        address: {
          street: profile.address?.street || existingUser.profile?.address?.street,
          city: profile.address?.city || existingUser.profile?.address?.city,
          state: profile.address?.state || existingUser.profile?.address?.state,
          zipCode: profile.address?.zipCode || existingUser.profile?.address?.zipCode,
          country: profile.address?.country || existingUser.profile?.address?.country
        }
      };
    }

    console.log('Updating user with data:', updateData); // Debug log

    const user = await User.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found after update' });
    }

    console.log('Updated user:', user); // Debug log
    res.json(user);
  } catch (error) {
    console.error('Admin update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
