// server/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage fallback
let habits = [];
let habitId = 1;

// MongoDB connection
let isConnected = false;
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB');
      isConnected = true;
    })
    .catch(err => {
      console.log('❌ MongoDB connection failed, using in-memory storage');
      console.log(err.message);
    });
} else {
  console.log('📝 No MONGO_URI provided, using in-memory storage');
}

// Habit Schema
const habitSchema = new mongoose.Schema({
  title: { type: String, required: true },
  days: [{ type: Number }],
  history: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

const Habit = mongoose.model('Habit', habitSchema);

// Helpers
const getTodayString = () => new Date().toISOString().split('T')[0];
const getDayOfWeek = () => new Date().getDay();

// ---------------- ROUTES ---------------- //

// Get all habits
app.get('/api/habits', async (req, res) => {
  try {
    if (isConnected) {
      const dbHabits = await Habit.find().sort({ createdAt: -1 });
      res.json(dbHabits);
    } else {
      res.json(habits);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch habits' });
  }
});

// Create habit
app.post('/api/habits', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const newHabit = {
      title: title.trim(),
      days: [],
      history: [],
      createdAt: new Date()
    };

    if (isConnected) {
      const habit = new Habit(newHabit);
      const savedHabit = await habit.save();
      res.status(201).json(savedHabit);
    } else {
      newHabit._id = habitId++;
      habits.push(newHabit);
      res.status(201).json(newHabit);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// Toggle habit
app.patch('/api/habits/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const today = getTodayString();
    const dayOfWeek = getDayOfWeek();

    if (isConnected) {
      const habit = await Habit.findById(id);
      if (!habit) return res.status(404).json({ error: 'Habit not found' });

      const todayIndex = habit.history.indexOf(today);
      if (todayIndex === -1) {
        habit.history.push(today);
        if (!habit.days.includes(dayOfWeek)) habit.days.push(dayOfWeek);
      } else {
        habit.history.splice(todayIndex, 1);
        const dayIndex = habit.days.indexOf(dayOfWeek);
        if (dayIndex !== -1) habit.days.splice(dayIndex, 1);
      }

      const updatedHabit = await habit.save();
      res.json(updatedHabit);
    } else {
      const habit = habits.find(h => h._id == id);
      if (!habit) return res.status(404).json({ error: 'Habit not found' });

      const todayIndex = habit.history.indexOf(today);
      if (todayIndex === -1) {
        habit.history.push(today);
        if (!habit.days.includes(dayOfWeek)) habit.days.push(dayOfWeek);
      } else {
        habit.history.splice(todayIndex, 1);
        const dayIndex = habit.days.indexOf(dayOfWeek);
        if (dayIndex !== -1) habit.days.splice(dayIndex, 1);
      }

      res.json(habit);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle habit' });
  }
});

// Delete habit
app.delete('/api/habits/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (isConnected) {
      const deletedHabit = await Habit.findByIdAndDelete(id);
      if (!deletedHabit) return res.status(404).json({ error: 'Habit not found' });
      res.json({ message: 'Habit deleted successfully' });
    } else {
      const habitIndex = habits.findIndex(h => h._id == id);
      if (habitIndex === -1) return res.status(404).json({ error: 'Habit not found' });
      habits.splice(habitIndex, 1);
      res.json({ message: 'Habit deleted successfully' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

// Motivation quotes
app.get('/api/motivation', async (req, res) => {
  console.log('Motivation endpoint called');
  try {
    const getQuotes = () => {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'type.fit',
          path: '/api/quotes',
          method: 'GET',
          headers: { 'User-Agent': 'Wellnest-App/1.0' }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Failed to parse quotes'));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        req.end();
      });
    };

    const quotes = await getQuotes();
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    res.json(randomQuote);
  } catch (error) {
    const fallbackQuotes = [
      { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
      { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
      { text: "It always seems impossible until it's done.", author: "Nelson Mandela" }
    ];
    const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
    res.json(randomQuote);
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    database: isConnected ? 'MongoDB' : 'In-Memory',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Wellnest server running on port ${PORT}`);
  console.log(`📊 Database: ${isConnected ? 'MongoDB' : 'In-Memory Storage'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💡 Motivation: http://localhost:${PORT}/api/motivation`);
});
