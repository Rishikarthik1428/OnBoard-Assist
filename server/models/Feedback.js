const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userEmail: String,
  userRole: String,
  question: {
    type: String,
    required: true,
    trim: true
  },
  botResponse: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer'
    }
  },
  correctAnswer: String,
  userComment: {
    type: String,
    trim: true,
    maxlength: 500
  },
  isHelpful: {
    type: Boolean,
    default: true
  },
  category: String,
  tags: [String],
  metadata: {
    responseTime: Number,
    sourceCount: Number,
    modelUsed: String
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
feedbackSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ conversationId: 1 });
feedbackSchema.index({ rating: 1 });
feedbackSchema.index({ isHelpful: 1 });
feedbackSchema.index({ userRole: 1 });
feedbackSchema.index({ category: 1 });

// Static method to get average rating
feedbackSchema.statics.getAverageRating = async function() {
  const result = await this.aggregate([
    { $match: { rating: { $gte: 1, $lte: 5 } } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } }
  ]);
  
  return result[0] || { average: 0, count: 0 };
};

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);