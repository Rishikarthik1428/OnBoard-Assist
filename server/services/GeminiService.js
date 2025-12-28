const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-pro",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    });
  }

  async generateResponse(userQuestion, context = '', userRole = 'employee', userName = '') {
    try {
      const roleContext = this.getRoleContext(userRole);
      const nameContext = userName ? ` The user's name is ${userName}.` : '';

      const prompt = `
        ROLE: You are an AI assistant for new employees at a company.${nameContext}
        USER TYPE: ${roleContext}
        
        CONTEXT FROM KNOWLEDGE BASE (use this information to answer):
        ${context || 'No specific context available. Use general knowledge about employee onboarding.'}
        
        USER QUESTION:
        "${userQuestion}"
        
        INSTRUCTIONS:
        1. Answer based on the context provided above when possible
        2. If the answer is not in the context, say: "I don't have specific information about that in our knowledge base. Please contact ${userRole === 'hr' ? 'your manager' : 'HR or your manager'} for assistance."
        3. Be helpful, concise, and professional
        4. Use bullet points for lists
        5. End with a relevant follow-up question if appropriate
        6. Format your response in clear paragraphs
        7. Never mention that you're an AI or about the context/system
        8. If it's a greeting, respond warmly
        9. If it's a thank you, acknowledge politely
        
        RESPONSE (in plain text, no markdown):
      `;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      // Clean up the response
      let cleanedResponse = response.text()
        .replace(/^\*+/gm, '') // Remove asterisks
        .replace(/^#+\s*/gm, '') // Remove markdown headers
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim();
      
      return cleanedResponse;
      
    } catch (error) {
      console.error('Gemini API Error:', error.message);
      
      if (error.message.includes('API_KEY_INVALID') || error.message.includes('quota')) {
        return "I apologize, but the AI service is currently unavailable due to technical issues. Please try again later or contact IT support for assistance.";
      }
      
      console.error('Gemini API Error (Falling back to Mock Mode):', error.message);
      
      // MOCK FALLBACK for demo purposes
      return "I'm having trouble connecting to the AI brain specifically, but I can still allow you to test the interface! (Error: Invalid API Key). \n\nNormally I would answer your question about \"" + userQuestion + "\" based on company policy.";
    }
  }

  async summarizeText(text, maxLength = 500) {
    try {
      const prompt = `
        Summarize the following text for a knowledge base. 
        Extract key points and create a concise summary.
        Keep it under ${maxLength} characters.
        
        TEXT:
        ${text.substring(0, 5000)}... (truncated)
        
        SUMMARY:
      `;
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().substring(0, maxLength).trim();
    } catch (error) {
      console.error('Summarization error:', error);
      return text.substring(0, 200) + '...';
    }
  }

  async extractKeywords(text) {
    try {
      const prompt = `
        Extract 3-5 keywords from the following text. 
        Return them as a comma-separated list.
        
        TEXT:
        ${text.substring(0, 1000)}
        
        KEYWORDS:
      `;
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text().split(',').map(k => k.trim().toLowerCase());
    } catch (error) {
      return [];
    }
  }

  getRoleContext(role) {
    switch (role) {
      case 'admin':
        return 'Company Administrator (has access to all information)';
      case 'hr':
        return 'HR Staff Member (has access to HR-related information)';
      default:
        return 'New Employee (needs help with onboarding)';
    }
  }
}

module.exports = new GeminiService();