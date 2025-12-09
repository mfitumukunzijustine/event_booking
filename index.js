const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'event_booking'
};

let pool;

// Initialize database connection and create tables
async function initDB() {
  try {
    pool = mysql.createPool(Object.assign({ waitForConnections: true, connectionLimit: 10 }, dbConfig));

    // Events table: stores event info and available seats
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        total_seats INT NOT NULL,
        seats_available INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Users table: basic user identification for bookings
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bookings table: stores reservations
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        event_id INT NOT NULL,
        seats_reserved INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);

    console.log('Database connected and tables ready');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// EVENTS
// GET all events
app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM events ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET single event
app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Create event
app.post('/api/events', async (req, res) => {
  const { name, description, total_seats } = req.body;
  if (!name || !total_seats || total_seats <= 0) {
    return res.status(400).json({ error: 'Name and positive total_seats are required' });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO events (name, description, total_seats, seats_available) VALUES (?, ?, ?, ?)',
      [name, description || null, total_seats, total_seats]
    );
    res.status(201).json({ id: result.insertId, name, description, total_seats, message: 'Event created' });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, total_seats } = req.body;

  try {
    const [rows] = await pool.execute('SELECT total_seats, seats_available FROM events WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    const current = rows[0];
    const booked = current.total_seats - current.seats_available;

    if (total_seats !== undefined) {
      if (total_seats < booked) {
        return res.status(400).json({ error: 'New total_seats is less than already booked seats' });
      }

      const new_available = total_seats - booked;
      await pool.execute(
        'UPDATE events SET name = COALESCE(?, name), description = COALESCE(?, description), total_seats = ?, seats_available = ? WHERE id = ?',
        [name, description, total_seats, new_available, id]
      );
    } else {
      await pool.execute(
        'UPDATE events SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?',
        [name, description, id]
      );
    }

    res.json({ message: 'Event updated' });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// USERS
// Create user
app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

  try {
    const [result] = await pool.execute('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
    res.status(201).json({ id: result.insertId, name, email });
  } catch (error) {
    console.error('Error creating user:', error);
    if (error && error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get user
app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute('SELECT id, name, email, created_at FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// BOOKINGS
// Create a booking (transactional to prevent overbooking)
app.post('/api/bookings', async (req, res) => {
  const { user_id, event_id, seats } = req.body;
  if (!user_id || !event_id || !seats || seats <= 0) return res.status(400).json({ error: 'user_id, event_id and positive seats are required' });

  try {
    // verify user exists
    const [users] = await pool.execute('SELECT id FROM users WHERE id = ?', [user_id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    // get a dedicated connection for the transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock the event row
      const [events] = await conn.execute('SELECT seats_available FROM events WHERE id = ? FOR UPDATE', [event_id]);
      if (events.length === 0) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ error: 'Event not found' });
      }

      const seatsAvailable = events[0].seats_available;
      if (seatsAvailable < seats) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Not enough seats available' });
      }

      // Deduct seats and insert booking
      await conn.execute('UPDATE events SET seats_available = seats_available - ? WHERE id = ?', [seats, event_id]);
      const [result] = await conn.execute('INSERT INTO bookings (user_id, event_id, seats_reserved) VALUES (?, ?, ?)', [user_id, event_id, seats]);

      await conn.commit();
      conn.release();

      res.status(201).json({ booking_id: result.insertId, message: 'Booking created' });
    } catch (err) {
      try { await conn.rollback(); } catch (e) { console.error('Rollback failed:', e); }
      conn.release();
      throw err;
    }
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get bookings for an event
app.get('/api/events/:id/bookings', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT b.id, b.seats_reserved, b.created_at, u.id as user_id, u.name as user_name, u.email as user_email
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.event_id = ?
       ORDER BY b.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bookings for event:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get bookings for a user
app.get('/api/users/:id/bookings', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT b.id, b.seats_reserved, b.created_at, e.id as event_id, e.name as event_name
       FROM bookings b
       JOIN events e ON b.event_id = e.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bookings for user:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Optional: list all bookings
app.get('/api/bookings', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.id, b.seats_reserved, b.created_at, u.id as user_id, u.name as user_name, e.id as event_id, e.name as event_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN events e ON b.event_id = e.id
       ORDER BY b.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
