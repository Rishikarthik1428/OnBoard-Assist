import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Container, Paper, TextField, IconButton,
  Avatar, Typography, Button, Chip,
  CircularProgress, Card, CardContent
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import axios from 'axios';

const ChatUI = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [quickReplies, setQuickReplies] = useState([
    "What are the working hours?",
    "How do I request vacation?",
    "Who do I contact for IT issues?",
    "What benefits are available?"
  ]);
  const [showFeedback, setShowFeedback] = useState(null);
  const messagesEndRef = useRef(null);

  // Initialize session
  useEffect(() => {
    const savedSessionId = localStorage.getItem('chatSessionId');
    if (savedSessionId) {
      setSessionId(savedSessionId);
      loadConversationHistory(savedSessionId);
    } else {
      // Start with welcome message
      setMessages([{
        role: 'bot',
        content: "👋 Welcome! I'm your onboarding assistant. I can help you with company policies, benefits, IT setup, and more. What would you like to know?",
        timestamp: new Date(),
        quickReplies: quickReplies
      }]);
    }
  }, []);

  const loadConversationHistory = async (sessionId) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/chat/history/${sessionId}`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage = { 
      role: 'user', 
      content: input, 
      timestamp: new Date() 
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setInput('');
    setShowFeedback(null);

    try {
      const response = await axios.post('http://localhost:5000/api/chat', {
        message: input,
        sessionId: sessionId
      });
      
      const botMessage = {
        role: 'bot',
        content: response.data.reply,
        quickReplies: response.data.quickReplies,
        timestamp: new Date(),
        conversationId: response.data.conversationId
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      if (response.data.sessionId && !sessionId) {
        setSessionId(response.data.sessionId);
        localStorage.setItem('chatSessionId', response.data.sessionId);
      }
      
      if (response.data.quickReplies) {
        setQuickReplies(response.data.quickReplies);
      }
      
      // Show feedback option
      setShowFeedback(response.data.conversationId);
      
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'bot',
        content: "Sorry, I'm having trouble connecting. Please try again later.",
        timestamp: new Date()
      }]);
    }
    
    setIsLoading(false);
  };

  const handleQuickReply = (reply) => {
    setInput(reply);
    setTimeout(() => sendMessage(), 100);
  };

  const handleFeedback = async (rating, conversationId) => {
    try {
      await axios.post('http://localhost:5000/api/chat/feedback', {
        conversationId,
        rating,
        response: messages[messages.length - 1].content
      });
      setShowFeedback(null);
    } catch (error) {
      console.error('Feedback error:', error);
    }
  };

  // Scroll to bottom
  const chatContainerRef = useRef(null);

  // Scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ height: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Chat Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'primary.main', color: 'white' }}>
          <Typography variant="h6">
            💼 Employee Onboarding Assistant
          </Typography>
          <Typography variant="caption">
            Ask me about policies, benefits, procedures, and more
          </Typography>
        </Box>

        {/* Messages Area */}
        <Box 
          ref={chatContainerRef}
          sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}
        >
          {messages.map((msg, idx) => (
            <Box key={idx} sx={{ mb: 2 }}>
              <Box sx={{ 
                display: 'flex', 
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start',
                gap: 1
              }}>
                {msg.role === 'bot' && (
                  <Avatar sx={{ bgcolor: 'secondary.main' }}>
                    🤖
                  </Avatar>
                )}
                
                <Paper
                  sx={{
                    p: 2,
                    maxWidth: '70%',
                    bgcolor: msg.role === 'user' ? 'primary.light' : 'grey.100',
                    color: msg.role === 'user' ? 'white' : 'inherit',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'
                  }}
                >
                  <Typography>{msg.content}</Typography>
                  
                  {msg.quickReplies && idx === messages.length - 1 && msg.role === 'bot' && (
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {msg.quickReplies.map((reply, i) => (
                        <Chip
                          key={i}
                          label={reply}
                          size="small"
                          onClick={() => handleQuickReply(reply)}
                          sx={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Box>
                  )}
                </Paper>
                
                {msg.role === 'user' && (
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    👤
                  </Avatar>
                )}
              </Box>
              
              <Typography 
                variant="caption" 
                sx={{ 
                  display: 'block',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                  ml: msg.role === 'bot' ? 6 : 0,
                  mr: msg.role === 'user' ? 6 : 0,
                  color: 'text.secondary'
                }}
              >
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
          ))}
          
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 1, ml: 6 }}>
              <Avatar sx={{ bgcolor: 'secondary.main' }}>🤖</Avatar>
              <Paper sx={{ p: 2 }}>
                <CircularProgress size={20} />
              </Paper>
            </Box>
          )}
          
          <div ref={messagesEndRef} />
        </Box>

        {/* Feedback Section */}
        {showFeedback && (
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Was this response helpful?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<ThumbUpIcon />}
                onClick={() => handleFeedback(5, showFeedback)}
              >
                Yes
              </Button>
              <Button
                size="small"
                startIcon={<ThumbDownIcon />}
                onClick={() => handleFeedback(1, showFeedback)}
              >
                No
              </Button>
              <Button size="small" onClick={() => setShowFeedback(null)}>
                Dismiss
              </Button>
            </Box>
          </Box>
        )}

        {/* Quick Replies */}
        {quickReplies.length > 0 && input === '' && (
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
              Quick questions:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {quickReplies.map((reply, idx) => (
                <Chip
                  key={idx}
                  label={reply}
                  variant="outlined"
                  onClick={() => handleQuickReply(reply)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Input Area */}
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
          <IconButton>
            <AttachFileIcon />
          </IconButton>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type your question here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            multiline
            maxRows={3}
          />
          <IconButton 
            color="primary" 
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            sx={{ alignSelf: 'flex-end' }}
          >
            {isLoading ? <CircularProgress size={24} /> : <SendIcon />}
          </IconButton>
        </Box>
      </Paper>

      {/* Info Card */}
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            💡 <strong>Tip:</strong> You can ask about:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            <Chip size="small" label="Working hours" variant="outlined" />
            <Chip size="small" label="Vacation policy" variant="outlined" />
            <Chip size="small" label="IT setup" variant="outlined" />
            <Chip size="small" label="Benefits" variant="outlined" />
            <Chip size="small" label="Dress code" variant="outlined" />
            <Chip size="small" label="Training" variant="outlined" />
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
};

export default ChatUI;