const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'bot', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  quickReplies: [String],
  metadata: {
    intent: String,
    length: Number,
    userAgent: String,
    sentiment: String
  }
});

const conversationSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: String,
  userName: String,
  userRole: String,
  messages: [messageSchema],
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    submittedAt: Date
  },
  metadata: {
    deviceType: String,
    browser: String,
    ipAddress: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
conversationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
conversationSchema.index({ userId: 1, updatedAt: -1 });
conversationSchema.index({ sessionId: 1, userId: 1 });
conversationSchema.index({ userEmail: 1 });
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ 'feedback.rating': 1 });

// Static method to get user conversations
conversationSchema.statics.findByUserId = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('-__v');
};

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);