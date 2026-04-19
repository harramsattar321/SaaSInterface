// backend/server.js - WITH CHAT STORAGE + FORGOT PASSWORD
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // built-in Node module, no install needed

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// ============================================
// CONFIG
// ============================================
const MONGODB_URI = 'mongodb+srv://bscs22f01_db_user:7oOk403ph8AGdSDm@virtualpatientsupport.75easkh.mongodb.net/patient_db?retryWrites=true&w=majority';
const JWT_SECRET = 'your-secret-key-change-in-production-12345';

// ✉️  YOUR HOSPITAL GMAIL — fill these in
const EMAIL_USER = 'virtualpatientsupport@gmail.com';       // ← your Gmail address
const EMAIL_PASS = 'hgll jbar sgnb vdml';           // ← 16-char App Password (spaces are fine)
const FRONTEND_URL = 'http://localhost:4200';        // ← change to your deployed URL in production

// ============================================
// NODEMAILER TRANSPORTER
// ============================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// ============================================
// MONGODB CONNECTION
// ============================================
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas → patient_db');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ============================================
// SCHEMAS
// ============================================

// --- Patient Schema ---
const patientSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
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
    index: true
  },
  password: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  // Password reset fields
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Patient = mongoose.model('Patient', patientSchema);

// --- Message Sub-Schema (embedded inside Chat) ---
const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// --- Chat Schema ---
const chatSchema = new mongoose.Schema({
  patientId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    default: 'New Chat',
    trim: true
  },
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

chatSchema.pre('save', function () {
  this.updatedAt = new Date();
});

const Chat = mongoose.model('Chat', chatSchema);

// ============================================
// HELPER: AI-Powered Chat Title Generator
// ============================================
function generateChatTitle(firstUserMessage, existingTitles = []) {
  if (!firstUserMessage || firstUserMessage.trim().length === 0) return 'New Chat';

  let msg = firstUserMessage.trim();

  // ── Greetings → skip to default ───────────────────────────────────────────
  if (/^(hi|hello|hey|howdy|good\s*(morning|afternoon|evening)|what'?s up|yo|sup)\b/i.test(msg)) {
    return uniqueTitle('General Conversation', existingTitles);
  }

  // ── Thanks / follow-up ────────────────────────────────────────────────────
  if (/^(thanks|thank you|thx|ty|cheers|appreciate)/i.test(msg)) {
    return uniqueTitle('Follow-up Message', existingTitles);
  }

  // ── RESCHEDULE ────────────────────────────────────────────────────────────
  if (/reschedul/i.test(msg)) {
    if (/appointment/i.test(msg))    return uniqueTitle('Rescheduling an Appointment', existingTitles);
    if (/doctor|dr\.?/i.test(msg))   return uniqueTitle('Rescheduling Doctor Visit', existingTitles);
    return uniqueTitle('Rescheduling Request', existingTitles);
  }

  // ── CANCEL ────────────────────────────────────────────────────────────────
  if (/cancel/i.test(msg)) {
    if (/appointment/i.test(msg)) return uniqueTitle('Cancelling an Appointment', existingTitles);
    return uniqueTitle('Cancellation Request', existingTitles);
  }

  // ── BOOK / SCHEDULE ───────────────────────────────────────────────────────
  if (/\b(book|schedule|make)\b.*(appointment|visit|slot|consultation)/i.test(msg)) {
    return uniqueTitle('Booking an Appointment', existingTitles);
  }

  // ── DOCTOR AVAILABILITY ───────────────────────────────────────────────────
  if (/\b(available|availability|free|open)\b.*\b(doctor|dr\.?|specialist)/i.test(msg) ||
      /\b(doctor|dr\.?|specialist)\b.*\b(available|availability|free|open)/i.test(msg) ||
      /what doctors are available/i.test(msg)) {
    const dayMatch = msg.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|next week|weekend)\b/i);
    if (dayMatch) return uniqueTitle(`Doctor Availability — ${toTitleCase(dayMatch[1])}`, existingTitles);
    return uniqueTitle('Doctor Availability', existingTitles);
  }

  // ── APPOINTMENT STATUS ────────────────────────────────────────────────────
  if (/\b(appointment|visit)\b/i.test(msg)) {
    if (/confirm|confirmation/i.test(msg)) return uniqueTitle('Appointment Confirmation', existingTitles);
    if (/status|update/i.test(msg))        return uniqueTitle('Appointment Status Update', existingTitles);
    if (/remind|reminder/i.test(msg))      return uniqueTitle('Appointment Reminder', existingTitles);
    if (/upcoming|next|future/i.test(msg)) return uniqueTitle('Upcoming Appointment', existingTitles);
    return uniqueTitle('Appointment Enquiry', existingTitles);
  }

  // ── INSURANCE ─────────────────────────────────────────────────────────────
  if (/insurance/i.test(msg)) {
    if (/accept|support|partner|cover|network/i.test(msg)) return uniqueTitle('Accepted Insurance Providers', existingTitles);
    if (/claim/i.test(msg))                                return uniqueTitle('Insurance Claim Help', existingTitles);
    if (/cost|price|fee|pay/i.test(msg))                   return uniqueTitle('Insurance Coverage & Costs', existingTitles);
    return uniqueTitle('Insurance Enquiry', existingTitles);
  }

  // ── SYMPTOMS ──────────────────────────────────────────────────────────────
  const symptomMatch = msg.match(
    /\b(pain|ache|fever|cough|cold|nausea|vomiting|headache|migraine|dizziness|fatigue|weakness|swelling|bleeding|rash|itching|burning|numbness|chest tightness|shortness of breath|sore throat|back pain|stomach ache|anxiety|depression)\b/i
  );
  if (symptomMatch) {
    return uniqueTitle(`${toTitleCase(symptomMatch[1])} — Symptom Help`, existingTitles);
  }

  // ── MEDICATION / PRESCRIPTION ─────────────────────────────────────────────
  if (/\b(medication|medicine|drug|prescription|dose|dosage|side effect|tablet|pill|inject)\b/i.test(msg)) {
    if (/side effect/i.test(msg)) return uniqueTitle('Medication Side Effects', existingTitles);
    if (/dose|dosage/i.test(msg)) return uniqueTitle('Medication Dosage Query', existingTitles);
    return uniqueTitle('Medication Enquiry', existingTitles);
  }

  // ── LAB / TEST / REPORT ───────────────────────────────────────────────────
  if (/\b(lab|test|report|result|blood|urine|x.?ray|scan|mri|ultrasound|ecg|ekg)\b/i.test(msg)) {
    if (/result|report/i.test(msg)) return uniqueTitle('Lab Results & Reports', existingTitles);
    return uniqueTitle('Medical Test Enquiry', existingTitles);
  }

  // ── BILLING / PAYMENT ─────────────────────────────────────────────────────
  if (/\b(bill|billing|payment|pay|fee|cost|price|charge|invoice|receipt)\b/i.test(msg)) {
    return uniqueTitle('Billing & Payment Query', existingTitles);
  }

  // ── EMERGENCY ─────────────────────────────────────────────────────────────
  if (/\b(emergency|urgent|immediately|right now|critical|serious)\b/i.test(msg)) {
    return uniqueTitle('Urgent Medical Query', existingTitles);
  }

  // ── HOW DO I / HOW TO ─────────────────────────────────────────────────────
  const howMatch = msg.match(/^how\s+(?:do\s+i|to|can\s+i|should\s+i)\s+(.+?)(?:\?|$)/i);
  if (howMatch) {
    const topic = howMatch[1].trim().replace(/[?.!]+$/, '');
    return uniqueTitle(toTitleCase(topic), existingTitles);
  }

  // ── WHAT IS / WHAT ARE ────────────────────────────────────────────────────
  const whatMatch = msg.match(/^what\s+(?:is|are|was|were)\s+(?:a\s+|an\s+|the\s+)?(.+?)(?:\?|$)/i);
  if (whatMatch) {
    const topic = whatMatch[1].trim().replace(/[?.!]+$/, '');
    return uniqueTitle(toTitleCase(topic), existingTitles);
  }

  // ── CAN I / SHOULD I ─────────────────────────────────────────────────────
  const canMatch = msg.match(/^(?:can|should|could|would)\s+(?:i|you|we)\s+(.+?)(?:\?|$)/i);
  if (canMatch) {
    const topic = canMatch[1].trim().replace(/[?.!]+$/, '');
    return uniqueTitle(toTitleCase(topic), existingTitles);
  }

  // ── FALLBACK — truncate the message cleanly ───────────────────────────────
  let title = msg.replace(/[*_`#>\-]+/g, '').trim();
  title = title.replace(/[.!?]+$/, '').trim();
  title = toTitleCase(title);
  if (title.length > 50) {
    title = title.substring(0, 50).replace(/\s+\S*$/, '') + '...';
  }

  return uniqueTitle(title || 'New Chat', existingTitles);
}

// ── Appends date suffix if title already exists ──────────────────────────────
function uniqueTitle(title, existingTitles) {
  if (!existingTitles.includes(title)) return title;

  // Try appending today's date
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const withDate = `${title} · ${dateStr}`;
  if (!existingTitles.includes(withDate)) return withDate;

  // If date version also exists, append a counter
  let counter = 2;
  while (existingTitles.includes(`${title} · ${dateStr} (${counter})`)) counter++;
  return `${title} · ${dateStr} (${counter})`;
}

function toTitleCase(str) {
  const lowers = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it']);
  return str
    .toLowerCase()
    .replace(/[?.!]+$/, '')
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 || !lowers.has(word))
      ? word.charAt(0).toUpperCase() + word.slice(1)
      : word)
    .join(' ');
}

function fallbackTitle(msg) {
  // Clean and truncate — only used if Flask is down
  let title = msg.trim().replace(/[*_`#>\-]+/g, '').trim();
  title = title.replace(/[.!?]+$/, '').trim();
  if (title.length > 50) {
    title = title.substring(0, 50).replace(/\s+\S*$/, '') + '...';
  }
  return title || 'New Chat';
}

function toTitleCase(str) {
  const lowers = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','is','it']);
  return str
    .toLowerCase()
    .replace(/[?.!]+$/, '')
    .trim()
    .split(/\s+/)
    .map((word, i) => (i === 0 || !lowers.has(word)) ? word.charAt(0).toUpperCase() + word.slice(1) : word)
    .join(' ');
}

// ============================================
// MIDDLEWARE: Authenticate JWT Token
// ============================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ============================================
// ROUTES — AUTH
// ============================================

app.get('/', (req, res) => {
  res.json({ message: 'Hospital Backend API is running!' });
});

// SIGNUP
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;
    console.log('📝 Signup attempt:', { firstName, lastName, email, phoneNumber });

    if (!firstName || !lastName || !email || !password || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existingPatient = await Patient.findOne({ email }).lean().exec();
    if (existingPatient) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const userId = 'PAT' + Date.now() + Math.floor(Math.random() * 1000);
    const hashedPassword = await bcrypt.hash(password, 8);

    const newPatient = new Patient({ userId, firstName, lastName, email, password: hashedPassword, phoneNumber });
    await newPatient.save();
    console.log('✅ User created:', userId);

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
    res.status(500).json({ success: false, message: 'Server error during signup: ' + error.message });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  req.setTimeout(10000);
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt:', email);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const patient = await Patient.findOne({ email })
      .select('userId firstName lastName email phoneNumber password')
      .lean()
      .exec();

    if (!patient) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, patient.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: patient.userId, email: patient.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

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
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Server error during login' });
    }
  }
});

// ============================================
// FORGOT PASSWORD
// ============================================

// STEP 1 — Request reset link
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const patient = await Patient.findOne({ email: email.toLowerCase().trim() });

    // Always respond with success — never reveal if the email exists (security)
    const genericResponse = {
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.'
    };

    if (!patient) {
      console.log(`⚠️  Forgot password: email not found (${email})`);
      return res.status(200).json(genericResponse);
    }

    // Generate a secure random token valid for 1 hour
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    patient.resetPasswordToken = resetToken;
    patient.resetPasswordExpires = resetExpires;
    await patient.save();

    const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Send the email
    await transporter.sendMail({
      from: `"Virtual Patient Support" <${EMAIL_USER}>`,
      to: patient.email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 30px; border: 1px solid #c7d9ff; border-radius: 12px;">
          <h2 style="color: #0d3b66;">Password Reset</h2>
          <p style="color: #333;">Hi ${patient.firstName},</p>
          <p style="color: #333;">We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetLink}"
             style="display:inline-block; margin: 20px 0; padding: 12px 28px; background:#0d3b66; color:white; border-radius:8px; text-decoration:none; font-weight:bold;">
            Reset My Password
          </a>
          <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email. Your password will not change.</p>
          <hr style="border:none; border-top:1px solid #eee; margin-top:24px;">
          <p style="color: #aaa; font-size: 12px;">Virtual Patient Support System</p>
        </div>
      `
    });

    console.log(`✉️  Password reset email sent to: ${patient.email}`);
    return res.status(200).json(genericResponse);

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// STEP 2 — Reset password using the token
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Find patient with a valid, non-expired token
    const patient = await Patient.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() } // token must not be expired
    });

    if (!patient) {
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid or has expired. Please request a new one.'
      });
    }

    // Hash new password and clear the reset token
    patient.password = await bcrypt.hash(newPassword, 8);
    patient.resetPasswordToken = null;
    patient.resetPasswordExpires = null;
    await patient.save();

    console.log(`✅ Password reset successful for: ${patient.email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });

  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// ============================================
// ROUTES — USER PROFILE
// ============================================

app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId })
      .select('-password')
      .lean()
      .exec();

    if (!patient) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, user: patient });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
    res.status(500).json({ success: false, message: 'Server error during update' });
  }
});

// ============================================
// ROUTES — CHATS  (all protected)
// ============================================

app.post('/api/chats/new', authenticateToken, async (req, res) => {
  try {
    const chat = new Chat({ patientId: req.user.userId, title: 'New Chat', messages: [] });
    await chat.save();
    console.log(`💬 New chat created: ${chat._id} for patient: ${req.user.userId}`);

    res.status(201).json({
      success: true,
      message: 'New chat session created',
      chat: {
        chatId: chat._id,
        patientId: chat.patientId,
        title: chat.title,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Create chat error:', error);
    res.status(500).json({ success: false, message: 'Server error creating chat' });
  }
});

app.post('/api/chats/:chatId/message', authenticateToken, async (req, res) => {
  try {
    const { role, content } = req.body;
    const { chatId } = req.params;

    if (!role || !content) {
      return res.status(400).json({ success: false, message: 'role and content are required' });
    }

    if (!['user', 'assistant'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be "user" or "assistant"' });
    }

    const chat = await Chat.findOne({ _id: chatId, patientId: req.user.userId });

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found or access denied' });
    }

    // Generate title from first user message
    if (role === 'user' && chat.title === 'New Chat' && chat.messages.length === 0) {
      // Fetch this patient's existing titles to avoid duplicates
      const existingChats = await Chat.find({
        patientId: req.user.userId,
        _id: { $ne: chatId },
        title: { $ne: 'New Chat' }
      }).select('title').lean();

      const existingTitles = existingChats.map(c => c.title);

      // Generate AI title (async — await it)
      chat.title = await generateChatTitle(content, existingTitles);
      console.log(`✏️  AI title set: "${chat.title}"`);
    }

    chat.messages.push({ role, content });
    await chat.save();

    res.status(200).json({
      success: true,
      message: 'Message saved',
      chatId: chat._id,
      title: chat.title,
      savedMessage: {
        role,
        content,
        timestamp: chat.messages[chat.messages.length - 1].timestamp
      }
    });

  } catch (error) {
    console.error('❌ Add message error:', error);
    res.status(500).json({ success: false, message: 'Server error saving message' });
  }
});

app.get('/api/chats', authenticateToken, async (req, res) => {
  try {
    const chats = await Chat.find({ patientId: req.user.userId })
      .select('_id title createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      chats: chats.map(c => ({
        chatId: c._id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    });

  } catch (error) {
    console.error('❌ Fetch chats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching chats' });
  }
});

app.get('/api/chats/:chatId', authenticateToken, async (req, res) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, patientId: req.user.userId }).lean().exec();

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found or access denied' });
    }

    res.status(200).json({
      success: true,
      chat: {
        chatId: chat._id,
        patientId: chat.patientId,
        title: chat.title,
        messages: chat.messages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Fetch chat error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching chat' });
  }
});

app.put('/api/chats/:chatId/rename', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const chat = await Chat.findOneAndUpdate(
      { _id: req.params.chatId, patientId: req.user.userId },
      { title: title.trim(), updatedAt: new Date() },
      { new: true }
    ).select('_id title updatedAt').lean().exec();

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found or access denied' });
    }

    console.log(`✏️  Chat renamed: ${chat._id} → "${chat.title}"`);

    res.status(200).json({
      success: true,
      message: 'Chat renamed successfully',
      chat: { chatId: chat._id, title: chat.title, updatedAt: chat.updatedAt }
    });

  } catch (error) {
    console.error('❌ Rename chat error:', error);
    res.status(500).json({ success: false, message: 'Server error renaming chat' });
  }
});

app.delete('/api/chats/:chatId', authenticateToken, async (req, res) => {
  try {
    const result = await Chat.findOneAndDelete({ _id: req.params.chatId, patientId: req.user.userId });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Chat not found or access denied' });
    }

    console.log(`🗑️  Chat deleted: ${req.params.chatId}`);
    res.status(200).json({ success: true, message: 'Chat deleted successfully' });

  } catch (error) {
    console.error('❌ Delete chat error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting chat' });
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`\n   AUTH ROUTES:`);
  console.log(`   POST  /api/auth/signup`);
  console.log(`   POST  /api/auth/login`);
  console.log(`   POST  /api/auth/forgot-password`);
  console.log(`   POST  /api/auth/reset-password`);
  console.log(`\n   USER ROUTES (protected):`);
  console.log(`   GET   /api/user/profile`);
  console.log(`   PUT   /api/user/update`);
  console.log(`\n   CHAT ROUTES (protected):`);
  console.log(`   POST  /api/chats/new`);
  console.log(`   POST  /api/chats/:chatId/message`);
  console.log(`   GET   /api/chats`);
  console.log(`   GET   /api/chats/:chatId`);
  console.log(`   PUT   /api/chats/:chatId/rename`);
  console.log(`   DELETE /api/chats/:chatId`);
});