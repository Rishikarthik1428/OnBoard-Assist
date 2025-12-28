const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const KnowledgeBase = require('../models/KnowledgeBase');
const Feedback = require('../models/Feedback');
const geminiService = require('../services/GeminiService');
const jwtService = require('../services/JwtService');

// Generate unique session ID
const generateSessionId = () => {
  return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Search knowledge base with enhanced relevance
const searchKnowledgeBase = async (query, userRole = 'employee') => {
  try {
    const results = await KnowledgeBase.searchByRole(query, userRole, 7);
    return results.map(doc => ({
      id: doc._id,
      title: doc.title,
      content: doc.content.substring(0, 1000), // Limit content length
      category: doc.category,
      summary: doc.summary,
      score: doc._doc?.score || 0
    }));
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
};

// Generate quick replies based on context
const generateQuickReplies = (userQuery, knowledgeResults, userRole) => {
  const defaultReplies = [
    "What are the working hours?",
    "How do I request vacation?",
    "Who do I contact for IT issues?",
    "What benefits are available?"
  ];

  // Add category-based quick replies
  const categories = new Set();
  knowledgeResults.forEach(doc => {
    if (doc.category) {
      categories.add(doc.category);
    }
  });

  const categoryReplies = Array.from(categories).map(cat => {
    const labels = {
      'policy': 'Company policies',
      'benefits': 'Employee benefits',
      'it': 'IT support',
      'hr': 'HR questions',
      'general': 'General information'
    };
    return labels[cat] || `${cat} info`;
  });

  // Merge and limit replies
  const allReplies = [...new Set([...defaultReplies, ...categoryReplies])];
  return allReplies.slice(0, 5);
};

// Analyze query intent
const analyzeQueryIntent = (query) => {
  const lowerQuery = query.toLowerCase();
  
  const intents = {
    greeting: /\b(hello|hi|hey|greetings|good morning|good afternoon|welcome)\b/i,
    thanks: /\b(thanks|thank you|appreciate|grateful)\b/i,
    policy: /\b(policy|policies|rule|rules|guideline|guidelines|procedure)\b/i,
    benefit: /\b(benefit|benefits|insurance|health|401k|retirement|wellness)\b/i,
    hr: /\b(hr|human resources|leave|vacation|holiday|time off|pto|payroll)\b/i,
    it: /\b(it|tech|technical|computer|laptop|software|hardware|password|login|email)\b/i,
    emergency: /\b(emergency|urgent|immediate|help now|critical|asap)\b/i,
    equipment: /\b(equipment|laptop|phone|desk|chair|monitor|hardware)\b/i,
    training: /\b(training|onboarding|orientation|learn|course|tutorial)\b/i
  };

  for (const [intent, pattern] of Object.entries(intents)) {
    if (pattern.test(lowerQuery)) {
      return intent;
    }
  }

  return 'general';
};

// Main chat endpoint with authentication
router.post('/', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const { message, sessionId: clientSessionId } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Message is required',
        reply: "Please enter a question or message."
      });
    }

    // Validate message length
    if (message.length > 1000) {
      return res.status(400).json({
        error: 'Message too long',
        reply: "Your message is too long. Please keep it under 1000 characters."
      });
    }

    // Get user info from auth middleware
    const user = req.user;
    const userRole = user?.role || 'employee';

    // Get or create session
    let sessionId = clientSessionId;
    let conversation = null;

    if (sessionId) {
      conversation = await Conversation.findOne({ sessionId, userId: user.id });
    }

    if (!conversation) {
      sessionId = generateSessionId();
      conversation = new Conversation({
        sessionId,
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        messages: [],
        metadata: {
          deviceType: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
          browser: req.headers['user-agent']?.split(' ')[0] || 'unknown',
          ipAddress: req.ip
        }
      });
    }

    // Save user message with metadata
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
      metadata: {
        intent: analyzeQueryIntent(message),
        length: message.length,
        userAgent: req.headers['user-agent']?.substring(0, 100)
      }
    });

    // Search knowledge base with user role context
    const knowledgeContext = await searchKnowledgeBase(message, userRole);
    const contextText = knowledgeContext.length > 0
      ? knowledgeContext.map(doc => `[${doc.category.toUpperCase()}] ${doc.title}:\n${doc.content}`).join('\n\n')
      : 'No specific knowledge base entries found for this query.';

    // Generate AI response with user context
    const startTime = Date.now();
    const botResponse = await geminiService.generateResponse(
      message, 
      contextText,
      userRole,
      user.name
    );
    const responseTime = Date.now() - startTime;

    // Generate dynamic quick replies
    const quickReplies = generateQuickReplies(message, knowledgeContext, userRole);

    // Save bot response
    conversation.messages.push({
      role: 'bot',
      content: botResponse,
      timestamp: new Date(),
      quickReplies: quickReplies,
      metadata: {
        knowledgeSources: knowledgeContext.map(doc => doc.id),
        responseLength: botResponse.length,
        responseTime: responseTime,
        generatedAt: new Date()
      }
    });

    conversation.updatedAt = new Date();
    await conversation.save();

    // Update view counts for knowledge base items
    const updatePromises = knowledgeContext.map(doc => 
      KnowledgeBase.findByIdAndUpdate(doc.id, { 
        $inc: { viewCount: 1 },
        lastAccessed: new Date()
      })
    );
    await Promise.all(updatePromises);

    res.json({
      success: true,
      reply: botResponse,
      sessionId: conversation.sessionId,
      quickReplies: quickReplies,
      conversationId: conversation._id,
      timestamp: new Date().toISOString(),
      metadata: {
        sourcesCount: knowledgeContext.length,
        userRole: userRole,
        responseTime: responseTime
      }
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    // Different error messages based on error type
    let errorMessage = "I'm having trouble processing your request. Please try again.";
    let statusCode = 500;

    if (error?.message?.includes('API key') || error?.message?.includes('Gemini')) {
      errorMessage = "The AI service is currently unavailable. Please try again later or contact IT support.";
      statusCode = 503;
    } else if (error.name === 'MongoError') {
      errorMessage = "Database connection issue. Please try again in a moment.";
      statusCode = 503;
    }

    res.status(statusCode).json({ 
      success: false,
      error: 'Internal server error',
      reply: errorMessage
    });
  }
});

// Get conversation history for authenticated user
router.get(['/history', '/history/:sessionId'], jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    
    let query = { userId };
    
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const conversations = await Conversation.find(query)
      .sort({ updatedAt: -1 })
      .limit(sessionId ? 1 : 20)
      .select('sessionId messages createdAt updatedAt userRole');

    if (!conversations || conversations.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'No conversations found',
        conversations: []
      });
    }

    // If specific session requested, return its messages
    if (sessionId) {
      const conversation = conversations[0];
      if (!conversation) {
        return res.status(404).json({ 
          success: false,
          error: 'Conversation not found' 
        });
      }
      
      return res.json({
        success: true,
        sessionId: conversation.sessionId,
        messages: conversation.messages,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        userRole: conversation.userRole
      });
    }

    // Return list of conversations with summary
    const conversationList = conversations.map(conv => ({
      sessionId: conv.sessionId,
      messageCount: conv.messages.length,
      lastMessage: conv.messages.length > 0 
        ? conv.messages[conv.messages.length - 1].content.substring(0, 100)
        : 'No messages',
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      userRole: conv.userRole
    }));

    res.json({
      success: true,
      total: conversations.length,
      conversations: conversationList
    });
    
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Submit feedback with enhanced validation
router.post('/feedback', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const { conversationId, rating, comment, question, response, isHelpful } = req.body;
    
    // Validate required fields
    if (!conversationId || !rating) {
      return res.status(400).json({ 
        success: false,
        error: 'Conversation ID and rating are required' 
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false,
        error: 'Rating must be between 1 and 5' 
      });
    }

    const conversation = await Conversation.findOne({ 
      _id: conversationId,
      userId: req.user.id 
    });
    
    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found or access denied' 
      });
    }

    // Get the last question and response from conversation
    const userMessages = conversation.messages.filter(msg => msg.role === 'user');
    const botMessages = conversation.messages.filter(msg => msg.role === 'bot');
    
    const lastQuestion = question || (userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '');
    const lastResponse = response || (botMessages.length > 0 ? botMessages[botMessages.length - 1].content : '');

    // Create feedback document
    const feedback = new Feedback({
      conversationId,
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      question: lastQuestion,
      botResponse: lastResponse,
      rating: parseInt(rating),
      comment: comment || '',
      isHelpful: isHelpful || (rating >= 4),
      category: conversation.messages[0]?.metadata?.intent || 'general',
      metadata: {
        responseTime: conversation.messages[conversation.messages.length - 1]?.metadata?.responseTime || 0,
        sourceCount: conversation.messages[conversation.messages.length - 1]?.metadata?.knowledgeSources?.length || 0
      },
      createdAt: new Date()
    });

    await feedback.save();

    // Update conversation with feedback
    conversation.feedback = {
      rating: parseInt(rating),
      comment: comment || '',
      submittedAt: new Date()
    };

    await conversation.save();

    res.json({ 
      success: true, 
      message: 'Feedback submitted successfully',
      feedbackId: feedback._id
    });
    
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to submit feedback',
      details: error.message 
    });
  }
});

// Get user's conversation statistics
router.get('/stats', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const userId = req.user.id;
    
    const [conversationStats, feedbackStats] = await Promise.all([
      // Conversation stats
      Conversation.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: { $size: "$messages" } },
            avgMessagesPerConversation: { $avg: { $size: "$messages" } },
            lastActivity: { $max: "$updatedAt" }
          }
        }
      ]),
      // Feedback stats
      Feedback.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalFeedback: { $sum: 1 },
            avgRating: { $avg: "$rating" },
            helpfulCount: { $sum: { $cond: ["$isHelpful", 1, 0] } }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      },
      conversationStats: conversationStats[0] || {
        totalConversations: 0,
        totalMessages: 0,
        avgMessagesPerConversation: 0,
        lastActivity: null
      },
      feedbackStats: feedbackStats[0] || {
        totalFeedback: 0,
        avgRating: 0,
        helpfulCount: 0
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Delete conversation
router.delete('/:sessionId', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const result = await Conversation.findOneAndDelete({ 
      sessionId, 
      userId 
    });

    if (!result) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found or access denied' 
      });
    }

    // Also delete associated feedback
    await Feedback.deleteMany({ conversationId: result._id });

    res.json({ 
      success: true, 
      message: 'Conversation deleted successfully' 
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Export conversation (for user download)
router.get('/export/:sessionId', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const conversation = await Conversation.findOne({ 
      sessionId, 
      userId 
    }).select('messages createdAt updatedAt userRole');

    if (!conversation) {
      return res.status(404).json({ 
        success: false,
        error: 'Conversation not found or access denied' 
      });
    }

    // Format conversation for export
    const exportData = {
      sessionId,
      userId,
      userName: req.user.name,
      userEmail: req.user.email,
      exportDate: new Date().toISOString(),
      totalMessages: conversation.messages.length,
      conversation: conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        quickReplies: msg.quickReplies || []
      })),
      metadata: {
        userRole: conversation.userRole,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      }
    };

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=conversation-${sessionId}.json`);
    
    res.json(exportData);

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Clear all user conversations
router.delete('/', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Conversation.deleteMany({ userId });

    // Also delete associated feedback
    await Feedback.deleteMany({ userId });

    res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} conversations successfully`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Clear all error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get recent popular questions
router.get('/popular-questions', jwtService.getAuthMiddleware(), async (req, res) => {
  try {
    const popularQuestions = [
      "What are the working hours?",
      "How do I request time off?",
      "Who do I contact for IT support?",
      "What benefits are available?",
      "How do I set up my email?",
      "What is the dress code?",
      "How do I access training materials?",
      "Who is my manager?",
      "How do I request equipment?",
      "What is the probation period?"
    ];

    res.json({
      success: true,
      questions: popularQuestions
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

module.exports = router;