

// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const { createServer } = require('http');
// const { Server } = require('socket.io');
// const { PrismaClient } = require('@prisma/client');
// const jwt = require('jsonwebtoken');
// const path = require('path');
// const multer = require('multer');
// const fs = require('fs');

// // Import routes and middleware
// const authRoutes = require('./routes/auth');
// const paperRoutes = require('./routes/papers');
// const chatRoutes = require('./routes/chat');
// const { authenticateToken } = require('./middleware/auth');



// const app = express();
// const httpServer = createServer(app);
// const io = new Server(httpServer, {
//   cors: {
//     origin: process.env.CORS_ORIGIN || 'https://iet-study-stream.netlify.app',
//     methods: ['GET', 'POST'],
//     credentials: true
//   }
// });

// const prisma = new PrismaClient();

// // Basic middleware
// app.use(express.json());

// const corsOptions = {
//   origin: function (origin, callback) {
//     const allowedOrigins = [process.env.CORS_ORIGIN || 'https://iet-study-stream.netlify.app'];
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'), false);
//     }
//   },
//   credentials: true
// };

// app.use(cors(corsOptions));

// // Serve static files from the uploads directory if not using S3
// if (process.env.USE_S3 !== 'true') {
//   const uploadsPath = path.join(__dirname, 'uploads');
//   app.use('/uploads', express.static(uploadsPath));
// }

// // Socket.IO Authentication
// io.use((socket, next) => {
//   const token = socket.handshake.auth.token;
//   if (!token) {
//     return next(new Error('Authentication error'));
//   }

//   jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//     if (err) return next(new Error('Authentication error'));
//     socket.user = decoded;
//     next();
//   });
// });

// // Socket.IO Connection Handler
// io.on('connection', (socket) => {
//   console.log('User connected:', socket.user.email);

//   socket.on('joinRoom', (roomId) => {
//     socket.join(roomId);
//   });

//   socket.on('sendMessage', async (data) => {
//     try {
//       const message = await prisma.message.create({
//         data: {
//           content: data.content,
//           senderId: data.sender,
//           roomId: data.roomId
//         },
//         include: {
//           sender: true
//         }
//       });
//       io.to(data.roomId).emit('message', message);
//     } catch (error) {
//       console.error('Error sending message:', error);
//     }
//   });

//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.user.email);
//   });
// });

// // Mount routes
// app.use('/api/auth', authRoutes);
// app.use('/api/papers', paperRoutes);
// app.use('/api/chat', chatRoutes);

// // Global error handling middleware
// app.use((err, req, res, next) => {
//   console.error('Error:', err.message);
//   console.error('Stack:', err.stack);
  
//   if (err instanceof multer.MulterError) {
//     if (err.code === 'LIMIT_FILE_SIZE') {
//       return res.status(400).json({ message: 'File size too large' });
//     }
//     return res.status(400).json({ message: 'File upload error' });
//   }
  
//   res.status(500).json({ message: 'Something went wrong!' });
// });

// // 404 handler
// app.use((req, res) => {
//   res.status(404).json({ message: 'Route not found' });
// });

// // Start the server
// const PORT = process.env.PORT || 5001;
// httpServer.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Import routes and middleware
const authRoutes = require('./routes/auth');
const paperRoutes = require('./routes/papers');
const chatRoutes = require('./routes/chat');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const httpServer = createServer(app);

// Define allowed origins
const allowedOrigins = [
  'http://localhost:5173',  // Vite default development port
  'http://localhost:3000',  // Alternative development port
  'https://iet-study-stream.netlify.app',
  process.env.CORS_ORIGIN
].filter(Boolean); // Remove any undefined values

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }
});

const prisma = new PrismaClient();

// Basic middleware
app.use(express.json());

// Pre-flight requests
app.options('*', cors());

// Serve static files
if (process.env.USE_S3 !== 'true') {
  const uploadsPath = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsPath));
}

// Socket.IO Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    socket.user = decoded;
    next();
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.user.email);

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
  });

  socket.on('sendMessage', async (data) => {
    try {
      const message = await prisma.message.create({
        data: {
          content: data.content,
          senderId: data.sender,
          roomId: data.roomId
        },
        include: {
          sender: true
        }
      });
      io.to(data.roomId).emit('message', message);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.user.email);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/chat', chatRoutes);

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large' });
    }
    return res.status(400).json({ message: 'File upload error' });
  }
  
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start the server
const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Allowed Origins:', allowedOrigins);
});