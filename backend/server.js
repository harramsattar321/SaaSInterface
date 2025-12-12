// backend/server.js - OPTIMIZED VERSION FOR FAST RESPONSE
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection with optimizations
const MONGODB_URI = 'mongodb+srv://bscs22f01_db_user:7oOk403ph8AGdSDm@virtualpatientsupport.75easkh.mongodb.net/patient_db?retryWrites=true&w=majority';
const JWT_SECRET = 'your-secret-key-change-in-production-12345';

// Connect to MongoDB with performance options
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Patient Schema with indexes for faster queries
const patientSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true // Add index for faster queries
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true // Add index for faster email lookup
  },
  password: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Patient = mongoose.model('Patient', patientSchema);

// ============================================
// ROUTES
// ============================================

// Test Route
app.get('/', (req, res) => {
  res.json({ message: 'Hospital Backend API is running!' });
});

// SIGNUP Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    console.log('📝 Signup attempt:', { firstName, lastName, email, phoneNumber });

    // Validation
    if (!firstName || !lastName || !email || !password || !phoneNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    // Check if user already exists (optimized query)
    const existingPatient = await Patient.findOne({ email }).lean().exec();
    if (existingPatient) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already registered' 
      });
    }

    // Generate unique userId
    const userId = 'PAT' + Date.now() + Math.floor(Math.random() * 1000);

    // Hash password with 8 rounds (faster but still secure)
    const hashedPassword = await bcrypt.hash(password, 8);

    // Create new patient
    const newPatient = new Patient({
      userId,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phoneNumber
    });

    await newPatient.save();

    console.log('✅ User created:', userId);

    // Generate JWT token
    const token = jwt.sign(
      { userId: newPatient.userId, email: newPatient.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        userId: newPatient.userId,
        firstName: newPatient.firstName,
        lastName: newPatient.lastName,
        email: newPatient.email,
        phoneNumber: newPatient.phoneNumber
      }
    });

  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during signup: ' + error.message
    });
  }
});

// LOGIN Route - OPTIMIZED FOR SPEED
app.post('/api/auth/login', async (req, res) => {
  // Set response timeout
  req.setTimeout(1000); // 3 second max
  
  try {
    const { email, password } = req.body;

    console.log('🔐 Login attempt:', email);

    // Quick validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Find patient by email - OPTIMIZED with lean() and select()
    const patient = await Patient.findOne({ email })
      .select('userId firstName lastName email phoneNumber password')
      .lean() // Returns plain JavaScript object (faster)
      .exec();

    // Early return if user not found
    if (!patient) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Check password - bcrypt.compare is the bottleneck
    const isPasswordValid = await bcrypt.compare(password, patient.password);
    
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    console.log('✅ Login successful:', patient.userId);

    // Generate JWT token
    const token = jwt.sign(
      { userId: patient.userId, email: patient.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Send response immediately
    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        userId: patient.userId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phoneNumber: patient.phoneNumber
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    
    // Don't wait - send error immediately
    if (!res.headersSent) {
      return res.status(500).json({ 
        success: false, 
        message: 'Server error during login' 
      });
    }
  }
});

// Middleware to authenticate token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }
    req.user = user;
    next();
  });
}

// Get User Profile (Protected Route)
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId })
      .select('-password')
      .lean()
      .exec();
    
    if (!patient) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.status(200).json({
      success: true,
      user: patient
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Update User Profile
app.put('/api/user/update', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber } = req.body;
    
    const updatedPatient = await Patient.findOneAndUpdate(
      { userId: req.user.userId },
      { firstName, lastName, phoneNumber },
      { new: true }
    ).select('-password').lean().exec();

    console.log('✅ Profile updated:', req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedPatient
    });

  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during update' 
    });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   API endpoints:`);
  console.log(`   - GET  http://localhost:${PORT}/`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/signup`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   - GET  http://localhost:${PORT}/api/user/profile`);
  console.log(`   - PUT  http://localhost:${PORT}/api/user/update`);
});