
// version 4 
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
const { upload, uploadToSupabase } = require('../middleware/upload');

const prisma = new PrismaClient();

// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Get all chat rooms
router.get('/rooms', authenticateToken, async (req, res) => {
  try {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({ message: 'Error fetching chat rooms' });
  }
});

// Create new chat room
router.post('/rooms', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;
    const room = await prisma.chatRoom.create({
      data: {
        title,
        isActive: true
      }
    });
    res.status(201).json(room);
  } catch (error) {
    console.error('Error creating chat room:', error);
    res.status(500).json({ message: 'Error creating chat room' });
  }
});

// Get messages for a specific room
router.get('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await prisma.message.findMany({
      where: {
        roomId
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        attachments: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Upload files
// router.post('/upload', authenticateToken, upload.array('files'), async (req, res) => {
//   try {
//     const files = req.files;
//     const fileUrls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
//     res.json({ fileUrls });
//   } catch (error) {
//     console.error('Error uploading files:', error);
//     res.status(500).json({ message: 'Error uploading files' });
//   }
// });

// router.post('/upload', authenticateToken, upload.array('files'), async (req, res) => {
//   try {
//     const files = req.files;
    
//     if (!files || files.length === 0) {
//       return res.status(400).json({ message: 'No files uploaded' });
//     }

//     // With S3, the file location is provided in the file object
//     const fileUrls = files.map(file => file.location);

//     // You might want to save these URLs to your database here
//     // For example, if you're associating these files with a user:
//     // await prisma.user.update({
//     //   where: { id: req.user.id },
//     //   data: { uploadedFiles: { push: fileUrls } }
//     // });

//     res.json({ fileUrls });
//   } catch (error) {
//     console.error('Error uploading files:', error);
//     res.status(500).json({ message: 'Error uploading files' });
//   }
// });
router.post('/upload', authenticateToken, upload.array('files'), async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const fileUrls = await Promise.all(files.map(file => uploadToSupabase(file)));

    // You might want to save these URLs to your database here
    // For example, if you're associating these files with a user:
    // await prisma.user.update({
    //   where: { id: req.user.id },
    //   data: { uploadedFiles: { push: fileUrls } }
    // });

    res.json({ fileUrls });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ message: 'Error uploading files' });
  }
});

// Create a new message
router.post('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, attachments } = req.body;
    const userId = req.user.id;

    const message = await prisma.message.create({
      data: {
        content,
        senderId: userId,
        roomId,
        attachments: {
          create: attachments || []
        }
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        attachments: true
      }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ message: 'Error creating message' });
  }
});

// Generate AI summary using OpenRouter API
async function generateAISummary(conversationText, stats) {
  const prompt = `Please create a comprehensive summary of the following chat conversation. Include key discussion points, main decisions or conclusions reached, and any important action items.

Chat Statistics:
- Duration: ${stats.duration} minutes
- Participants: ${stats.participants.join(', ')}
- Total Messages: ${stats.messageCount}
- Attachments Shared: ${stats.attachmentCount}

Conversation:
${conversationText}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "meta-llama/llama-3.2-3b-instruct:free",
        "messages": [
          {
            "role": "user",
            "content": prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating AI summary:', error);
    return null;
  }
}

// End chat and generate summary
router.post('/rooms/:roomId/end', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Get all messages from the room
    const messages = await prisma.message.findMany({
      where: { roomId },
      include: {
        sender: {
          select: {
            name: true
          }
        },
        attachments: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Calculate chat statistics
    const participants = Array.from(new Set(messages.map(msg => msg.sender.name)));
    const messageCount = messages.length;
    const attachmentCount = messages.reduce((count, msg) => count + msg.attachments.length, 0);
    const duration = messages.length > 0 
      ? Math.round((messages[messages.length - 1].createdAt - messages[0].createdAt) / (1000 * 60)) 
      : 0;

    // Prepare conversation text for AI summary
    const conversationText = messages
      .map(msg => `${msg.sender.name}: ${msg.content}`)
      .join('\n');

    const stats = {
      duration,
      participants,
      messageCount,
      attachmentCount
    };

    // Generate AI summary
    const aiSummary = await generateAISummary(conversationText, stats);

    // Create final summary combining statistics and AI analysis
    const finalSummary = `
Chat Statistics:
- Duration: ${duration} minutes
- Participants (${participants.length}): ${participants.join(', ')}
- Total Messages: ${messageCount}
- Attachments Shared: ${attachmentCount}

${aiSummary ? `AI-Generated Summary:\n${aiSummary}` : 'AI summary generation failed. Please review the chat history manually.'}
    `.trim();

    // Create summary and update room status in a transaction
    await prisma.$transaction([
      prisma.chatSummary.create({
        data: {
          chatRoomId: roomId,
          summary: finalSummary
        }
      }),
      prisma.chatRoom.update({
        where: { id: roomId },
        data: { isActive: false }
      })
    ]);

    res.json({ message: 'Chat ended successfully', summary: finalSummary });
  } catch (error) {
    console.error('Error ending chat:', error);
    res.status(500).json({ message: 'Error ending chat' });
  }
});

//Get chat summaries
// router.get('/summaries', authenticateToken, async (req, res) => {
//   try {
//     const summaries = await prisma.chatSummary.findMany({
//       include: {
//         chatRoom: {
//           include: {
//             messages: {
//               include: {
//                 sender: {
//                   select: {
//                     name: true
//                   }
//                 }
//               }
//             }
//           }
//         }
//       },
//       orderBy: {
//         createdAt: 'desc'
//       }
//     });

//     const formattedSummaries = summaries.map(summary => ({
//       id: summary.id,
//       roomTitle: summary.chatRoom.title,
//       summary: summary.summary,
//       participantCount: new Set(summary.chatRoom.messages.map(msg => msg.sender.name)).size,
//       messageCount: summary.chatRoom.messages.length,
//       date: summary.createdAt
//     }));

//     res.json(formattedSummaries);
//   } catch (error) {
//     console.error('Error fetching chat summaries:', error);
//     res.status(500).json({ message: 'Error fetching chat summaries' });
//   }
// });
router.get('/summaries', authenticateToken, async (req, res) => {
  try {
    const summaries = await prisma.chatSummary.findMany({
      include: {
        chatRoom: {
          include: {
            messages: {
              include: {
                sender: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formattedSummaries = summaries
      .filter(summary => summary.chatRoom !== null)
      .map(summary => ({
        id: summary.id,
        roomTitle: summary.chatRoom?.title || 'Deleted Room',
        summary: summary.summary,
        participantCount: new Set(summary.chatRoom?.messages.map(msg => msg.sender.name) || []).size,
        messageCount: summary.chatRoom?.messages.length || 0,
        date: summary.createdAt
      }));

    res.json(formattedSummaries);
  } catch (error) {
    console.error('Error fetching chat summaries:', error);
    res.status(500).json({ message: 'Error fetching chat summaries' });
  }
});

module.exports = router;