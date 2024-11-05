const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');
 // Multer middleware
 const { upload, uploadToSupabase } = require('../middleware/upload');


const prisma = new PrismaClient();

// Get all papers
router.get('/', async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        uploadDate: 'desc'
      }
    });
    res.json(papers);
  } catch (error) {
    console.error('Error fetching papers:', error);
    res.status(500).json({ message: 'Error fetching papers' });
  }
});

router.post('/', authenticateToken, upload.fields([
  { name: 'mst1', maxCount: 1 },
  { name: 'mst2', maxCount: 1 },
  { name: 'mst3', maxCount: 1 },
  { name: 'endsem', maxCount: 1 },
  { name: 'notes', maxCount: 1 }
]), async (req, res) => {
  try {
    const { subject, semester } = req.body;
    const files = req.files;

    // Upload each file to Supabase and get URLs
    const urls = {};
    for (const [key, fileArray] of Object.entries(files)) {
      if (fileArray && fileArray[0]) {
        urls[`${key}Url`] = await uploadToSupabase(fileArray[0]);
      }
    }

    // Create paper record in database
    const paper = await prisma.paper.create({
      data: {
        subject,
        semester: parseInt(semester),
        ...urls,
        uploadedBy: { connect: { id: req.user.id } },
      },
    });

    res.status(201).json({ message: 'Papers uploaded successfully', paper });
  } catch (error) {
    console.error('Error uploading papers:', error);
    res.status(500).json({ message: 'Error uploading papers' });
  }
});

// Get papers by semester
router.get('/semester/:semester', async (req, res) => {
  try {
    const semester = parseInt(req.params.semester);
    const papers = await prisma.paper.findMany({
      where: { semester },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        uploadDate: 'desc'
      }
    });
    res.json(papers);
  } catch (error) {
    console.error('Error fetching papers:', error);
    res.status(500).json({ message: 'Error fetching papers' });
  }
});

module.exports = router;

