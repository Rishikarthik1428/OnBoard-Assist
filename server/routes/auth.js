const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwtService = require('../services/JwtService');
const { body, validationResult } = require('express-validator');

// Rate limiting setup (simple in-memory version)
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

// Validation middleware
const validateRegister = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('name')
    .notEmpty().withMessage('Name is required')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('role').optional().isIn(['employee', 'admin', 'hr']).withMessage('Invalid role'),
  body('department').optional().trim(),
  body('position').optional().trim(),
  body('employeeId').optional().trim()
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
];

const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
    .not()
    .equals(body('currentPassword'))
    .withMessage('New password must be different from current password')
];

// Check rate limiting
const checkRateLimit = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  
  if (loginAttempts.has(ip)) {
    const attempts = loginAttempts.get(ip);
    
    if (attempts.count >= MAX_ATTEMPTS) {
      const timeLeft = attempts.firstAttempt + LOCK_TIME - now;
      
      if (timeLeft > 0) {
        return res.status(429).json({
          error: 'Too many login attempts. Please try again later.',
          retryAfter: Math.ceil(timeLeft / 1000)
        });
      } else {
        loginAttempts.delete(ip);
      }
    }
  }
  
  next();
};

// Register new user (admin/hr only in production)
router.post('/register', jwtService.getAuthMiddleware(['admin', 'hr']), validateRegister, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role = 'employee', department, position, employeeId } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { employeeId }] });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email or Employee ID already registered',
        code: 'DUPLICATE_ENTRY'
      });
    }

    // Create user
    const user = new User({
      email,
      password,
      name,
      role: req.user.role === 'admin' ? role : 'employee', // Only admin can set admin/hr roles
      department,
      position,
      employeeId
    });

    await user.save();

    // Generate token
    const token = jwtService.generateToken(user);

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: user.toJSON(),
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'User with this email or employee ID already exists' 
      });
    }
    
    res.status(500).json({ 
      error: 'Registration failed. Please try again.',
      code: 'SERVER_ERROR'
    });
  }
});

// Login
router.post('/login', checkRateLimit, validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const ip = req.ip;

    // Track login attempts
    if (!loginAttempts.has(ip)) {
      loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
    } else {
      const attempts = loginAttempts.get(ip);
      attempts.count += 1;
    }

    // Find user
    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Reset login attempts on successful login
    loginAttempts.delete(ip);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwtService.generateToken(user);

    // Set secure cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed. Please try again.',
      code: 'SERVER_ERROR'
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user profile
router.get('/profile', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update profile
router.put('/profile', jwtService.getAuthMiddleware(), [
  body('name').optional().trim().isLength({ min: 2, max: 50 }),
  body('department').optional().trim(),
  body('position').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, department, position } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        name, 
        department, 
        position,
        updatedAt: new Date()
      },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated',
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.post('/change-password', jwtService.getAuthMiddleware(), validateChangePassword, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwtService.decodeToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(404).json({ error: 'User not found or inactive' });
    }

    const newToken = jwtService.generateToken(user);

    // Set new cookie
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Token refreshed',
      token: newToken,
      user: user.toJSON()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Admin: Get all users
router.get('/users', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search, isActive } = req.query;
    const query = {};

    // Restrict HR to only see employees
    if (req.user.role === 'hr') {
      query.role = 'employee';
    } else if (role) {
      query.role = role;
    }
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-password',
      sort: { createdAt: -1 }
    };

    const users = await User.paginate(query, options);

    res.json({
      success: true,
      users: users.docs,
      pagination: {
        page: users.page,
        limit: users.limit,
        totalPages: users.totalPages,
        totalUsers: users.totalDocs
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin/HR: Update user role
router.put('/users/:id/role', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { role } = req.body;
    
    // Check permissions
    if (req.user.role === 'hr') {
      // HR can only manage employees
      const targetUser = await User.findById(req.params.id);
      if (!targetUser || targetUser.role !== 'employee') {
        return res.status(403).json({ error: 'HR can only modify employees' });
      }
      // HR cannot promote to admin/hr
      if (role !== 'employee') {
        return res.status(403).json({ error: 'HR cannot change user roles' });
      }
    }

    if (!['employee', 'admin', 'hr'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent self-role change
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, updatedAt: new Date() },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User role updated',
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Admin/HR: Toggle user status
router.put('/users/:id/status', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { isActive } = req.body;

    // Check permissions
    if (req.user.role === 'hr') {
      const targetUser = await User.findById(req.params.id);
      if (!targetUser || targetUser.role !== 'employee') {
        return res.status(403).json({ error: 'HR can only manage employees' });
      }
    }

    // Prevent self-deactivation
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        isActive,
        updatedAt: new Date()
      },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Check if user exists by email
router.get('/check-email/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    res.json({ exists: !!user });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;