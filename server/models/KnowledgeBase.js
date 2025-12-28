const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['policy', 'benefits', 'it', 'hr', 'general', 'admin-only', 'hr-only'],
    default: 'general'
  },
  source: {
    type: String,
    enum: ['upload', 'manual', 'system'],
    default: 'manual'
  },
  fileType: String,
  fileName: String,
  filePath: String,
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  accessRoles: [{
    type: String,
    enum: ['employee', 'admin', 'hr'],
    default: ['employee']
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: String,
    default: 'system'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: Date,
  viewCount: {
    type: Number,
    default: 0
  }
});

// Update timestamp on save
knowledgeBaseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create text index for full-text search
knowledgeBaseSchema.index({ 
  title: 'text', 
  content: 'text', 
  summary: 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    tags: 5,
    summary: 3,
    content: 1
  },
  name: 'text_search_index'
});

// Regular indexes
knowledgeBaseSchema.index({ category: 1 });
knowledgeBaseSchema.index({ source: 1 });
knowledgeBaseSchema.index({ createdBy: 1 });
knowledgeBaseSchema.index({ isActive: 1, category: 1 });

// Method to increment view count
knowledgeBaseSchema.methods.incrementView = async function() {
  this.viewCount += 1;
  this.lastAccessed = new Date();
  return this.save();
};

// Static method for searching with role-based filtering
knowledgeBaseSchema.statics.searchByRole = function(query, userRole = 'employee', limit = 10) {
  const searchQuery = {
    $text: { $search: query },
    isActive: true,
    $or: [
      { accessRoles: { $in: [userRole] } },
      { accessRoles: { $size: 0 } }
    ]
  };

  return this.find(searchQuery, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" } })
    .limit(limit)
    .select('-__v');
};

module.exports = mongoose.models.KnowledgeBase || mongoose.model('KnowledgeBase', knowledgeBaseSchema);