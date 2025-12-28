const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const pdf = require('pdf-parse');
const marked = require('marked');
const KnowledgeBase = require('../models/KnowledgeBase');
const Conversation = require('../models/Conversation');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const geminiService = require('../services/GeminiService');
const jwtService = require('../services/JwtService');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.md', '.txt', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Markdown, TXT, DOC, and DOCX files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Parse PDF files
const parsePDF = async (filePath) => {
  try {
    const dataBuffer = await fsPromises.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
};

// Parse Markdown files
const parseMarkdown = async (filePath) => {
  try {
    const data = await fsPromises.readFile(filePath, 'utf8');
    // Convert markdown to plain text
    const html = marked.parse(data);
    // Remove HTML tags for plain text
    return html.replace(/<[^>]*>/g, '');
  } catch (error) {
    console.error('Markdown parsing error:', error);
    throw new Error('Failed to parse Markdown file');
  }
};

// Parse text files
const parseText = async (filePath) => {
  try {
    const data = await fsPromises.readFile(filePath, 'utf8');
    return data;
  } catch (error) {
    console.error('Text parsing error:', error);
    throw new Error('Failed to parse text file');
  }
};

// Upload and parse document
router.post('/upload', jwtService.getAuthMiddleware(['admin', 'hr']), upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let content = '';

    // Parse based on file type
    switch (fileExt) {
      case '.pdf':
        content = await parsePDF(filePath);
        break;
      case '.md':
        content = await parseMarkdown(filePath);
        break;
      case '.txt':
        content = await parseText(filePath);
        break;
      case '.docx':
      case '.doc':
        // For DOC/DOCX, we'd need a library like mammoth
        content = await parseText(filePath); // Fallback to text parsing
        break;
      default:
        throw new Error('Unsupported file type');
    }

    // Generate summary using Gemini
    const summary = await geminiService.summarizeText(content);

    // Extract keywords
    const keywords = await geminiService.extractKeywords(content);

    // Extract title from first line or filename
    const title = req.body.title || 
                  req.file.originalname.replace(/\.[^/.]+$/, "") || 
                  'Untitled Document';

    // Determine access roles based on category
    const category = req.body.category || 'general';
    let accessRoles = ['employee']; // Default all employees can see
    if (category === 'admin-only') {
      accessRoles = ['admin'];
    } else if (category === 'hr-only') {
      accessRoles = ['admin', 'hr'];
    }

    // Save to knowledge base
    const knowledgeDoc = new KnowledgeBase({
      title,
      content,
      summary,
      category: category,
      source: 'upload',
      fileType: fileExt.substring(1),
      fileName: req.file.originalname,
      filePath: filePath,
      tags: [...keywords, ...(req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : [])],
      accessRoles: accessRoles,
      createdBy: req.user.email,
      createdByUserId: req.user.id
    });

    await knowledgeDoc.save();

    // Clean up file if it's too large and we have the content
    try {
      const stats = await fsPromises.stat(filePath);
      if (stats.size > 5 * 1024 * 1024) { // If file > 5MB
        await fsPromises.unlink(filePath);
        knowledgeDoc.filePath = null;
        await knowledgeDoc.save();
      }
    } catch (err) {
      console.warn('Could not clean up file:', err.message);
    }

    res.json({
      success: true,
      message: 'Document uploaded and parsed successfully',
      document: {
        id: knowledgeDoc._id,
        title: knowledgeDoc.title,
        summary: knowledgeDoc.summary,
        category: knowledgeDoc.category,
        tags: knowledgeDoc.tags
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if upload failed
    if (req.file && req.file.path) {
      try {
        await fsPromises.unlink(req.file.path);
      } catch (err) {
        console.warn('Could not delete failed upload:', err.message);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to upload and parse document',
      details: error.message 
    });
  }
});

// Get all knowledge base documents
router.get('/documents', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { category, search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const query = { isActive: true };
    
    if (category && category !== 'all') query.category = category;
    if (search) {
      query.$text = { $search: search };
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const documents = await KnowledgeBase.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-content');

    const total = await KnowledgeBase.countDocuments(query);

    // Get categories for filter
    const categories = await KnowledgeBase.distinct('category');

    res.json({
      success: true,
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        categories
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch documents' 
    });
  }
});

// Get single document
router.get('/documents/:id', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const document = await KnowledgeBase.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ 
        success: false,
        error: 'Document not found' 
      });
    }

    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch document' 
    });
  }
});

// Update document
router.put('/documents/:id', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { title, content, category, tags, isActive, accessRoles } = req.body;
    
    const document = await KnowledgeBase.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ 
        success: false,
        error: 'Document not found' 
      });
    }

    // Check if user can edit this document
    if (req.user.role !== 'admin' && document.createdBy !== req.user.email) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to update this document' 
      });
    }

    // Update document
    const updateData = {
      title,
      content,
      category,
      tags,
      isActive,
      accessRoles: accessRoles || document.accessRoles,
      updatedAt: new Date()
    };

    // Generate new summary if content changed
    if (content && content !== document.content) {
      updateData.summary = await geminiService.summarizeText(content);
    }

    const updatedDocument = await KnowledgeBase.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      message: 'Document updated successfully',
      document: updatedDocument
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update document' 
    });
  }
});

// Delete document
router.delete('/documents/:id', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const document = await KnowledgeBase.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ 
        success: false,
        error: 'Document not found' 
      });
    }

    // Check if user can delete this document
    if (req.user.role !== 'admin' && document.createdBy !== req.user.email) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to delete this document' 
      });
    }

    // Delete file if exists
    if (document.filePath) {
      try {
        await fsPromises.unlink(document.filePath);
      } catch (err) {
        console.warn('Could not delete file:', err.message);
      }
    }

    await KnowledgeBase.findByIdAndDelete(req.params.id);

    res.json({ 
      success: true, 
      message: 'Document deleted successfully' 
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete document' 
    });
  }
});

// Add manual Q&A
router.post('/qa', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { question, answer, category = 'general', tags = [] } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ 
        success: false,
        error: 'Question and answer are required' 
      });
    }

    const qaDoc = new KnowledgeBase({
      title: `Q: ${question.substring(0, 100)}${question.length > 100 ? '...' : ''}`,
      content: `Question: ${question}\n\nAnswer: ${answer}`,
      summary: answer.substring(0, 200),
      category: category,
      source: 'manual',
      tags: ['faq', 'qa', ...tags],
      accessRoles: category === 'admin-only' ? ['admin'] : category === 'hr-only' ? ['admin', 'hr'] : ['employee'],
      createdBy: req.user.email,
      createdByUserId: req.user.id
    });

    await qaDoc.save();

    res.json({ 
      success: true, 
      message: 'Q&A added successfully',
      document: qaDoc 
    });
  } catch (error) {
    console.error('Add Q&A error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add Q&A' 
    });
  }
});

// Get analytics dashboard data
router.get('/analytics', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const [conversationStats, feedbackStats, userStats, knowledgeStats] = await Promise.all([
      // Conversation stats
      Conversation.aggregate([
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: { $size: "$messages" } },
            avgMessagesPerConversation: { $avg: { $size: "$messages" } },
            todayConversations: {
              $sum: {
                $cond: [
                  { $gte: ["$createdAt", new Date(new Date().setHours(0, 0, 0, 0))] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      // Feedback stats
      Feedback.aggregate([
        {
          $group: {
            _id: null,
            totalFeedback: { $sum: 1 },
            avgRating: { $avg: "$rating" },
            helpfulPercentage: {
              $avg: { $cond: ["$isHelpful", 1, 0] }
            }
          }
        }
      ]),
      // User stats
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ["$isActive", 1, 0] } },
            byRole: {
              $push: {
                role: "$role",
                count: 1
              }
            }
          }
        },
        {
          $unwind: "$byRole"
        },
        {
          $group: {
            _id: "$byRole.role",
            count: { $sum: "$byRole.count" }
          }
        }
      ]),
      // Knowledge base stats
      KnowledgeBase.aggregate([
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            activeDocuments: { $sum: { $cond: ["$isActive", 1, 0] } },
            byCategory: {
              $push: {
                category: "$category",
                count: 1
              }
            },
            totalViews: { $sum: "$viewCount" }
          }
        }
      ])
    ]);

    // Process user stats
    const userRoleStats = {};
    userStats.forEach(stat => {
      userRoleStats[stat._id] = stat.count;
    });

    res.json({
      success: true,
      analytics: {
        conversations: conversationStats[0] || {
          totalConversations: 0,
          totalMessages: 0,
          avgMessagesPerConversation: 0,
          todayConversations: 0
        },
        feedback: feedbackStats[0] || {
          totalFeedback: 0,
          avgRating: 0,
          helpfulPercentage: 0
        },
        users: {
          total: userStats.reduce((sum, stat) => sum + stat.count, 0),
          byRole: userRoleStats
        },
        knowledgeBase: knowledgeStats[0] || {
          totalDocuments: 0,
          activeDocuments: 0,
          totalViews: 0
        }
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch analytics' 
    });
  }
});

// Get recent conversations
router.get('/conversations', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;

    const conversations = await Conversation.find()
      .populate('userId', 'name email role')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('sessionId messages feedback createdAt updatedAt userRole');

    const total = await Conversation.countDocuments();

    res.json({
      success: true,
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch conversations' 
    });
  }
});

// Get conversation details
router.get('/conversations/:id', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('userId', 'name email role department position');

    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found' 
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch conversation' 
    });
  }
});

// Get feedback list
router.get('/feedback', jwtService.getAuthMiddleware(['admin', 'hr']), async (req, res) => {
  try {
    const { limit = 20, page = 1, rating, helpful } = req.query;

    const query = {};
    if (rating) query.rating = parseInt(rating);
    if (helpful !== undefined) query.isHelpful = helpful === 'true';

    const feedback = await Feedback.find(query)
      .populate('userId', 'name email')
      .populate('conversationId', 'sessionId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Feedback.countDocuments(query);

    // Get feedback summary
    const summary = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          total: { $sum: 1 },
          byRating: {
            $push: {
              rating: "$rating",
              count: 1
            }
          }
        }
      },
      {
        $unwind: "$byRating"
      },
      {
        $group: {
          _id: "$byRating.rating",
          count: { $sum: "$byRating.count" },
          percentage: {
            $avg: {
              $multiply: [
                {
                  $divide: [
                    { $sum: "$byRating.count" },
                    "$total"
                  ]
                },
                100
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      feedback,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch feedback' 
    });
  }
});

// Get system health
router.get('/health', jwtService.getAuthMiddleware(['admin']), async (req, res) => {
  try {
    const [dbStatus, queueStatus, memoryUsage] = await Promise.all([
      // Database status
      Promise.resolve('connected'), // In real app, check actual DB connection
      // Queue status (if using queues)
      Promise.resolve('idle'),
      // Memory usage
      Promise.resolve(process.memoryUsage())
    ]);

    const uptime = process.uptime();
    const loadAverage = process.cpuUsage();

    res.json({
      success: true,
      health: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: {
          seconds: uptime,
          formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
        },
        database: dbStatus,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        },
        cpu: {
          user: loadAverage.user / 1000000, // Convert to seconds
          system: loadAverage.system / 1000000
        },
        environment: process.env.NODE_ENV || 'development',
        version: process.version,
        platform: process.platform
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Health check failed',
      details: error.message 
    });
  }
});

// Backup knowledge base
router.get('/backup', jwtService.getAuthMiddleware(['admin']), async (req, res) => {
  try {
    const documents = await KnowledgeBase.find().lean();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const backupData = {
      timestamp,
      version: '1.0',
      count: documents.length,
      documents
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=knowledge-base-backup-${timestamp}.json`);
    
    res.json(backupData);
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create backup' 
    });
  }
});

module.exports = router;