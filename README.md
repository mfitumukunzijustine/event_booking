# Notes App - DevOps Pipeline Project

A simple CRUD notes application built with Node.js, Express, MySQL, and Bootstrap, implementing a complete DevOps pipeline for learning and demonstration purposes.

## 🚀 Features

- **CRUD Operations**: Create, Read, Update, Delete notes
- **Responsive UI**: Bootstrap-based frontend with modern design
- **REST API**: RESTful endpoints for note management
- **Database Integration**: MySQL for persistent data storage
- **Health Monitoring**: Built-in health check endpoints
- **Containerization**: Docker support with multi-stage builds
- **CI/CD Pipeline**: GitHub Actions for automated testing and deployment

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [DevOps Implementation](#devops-implementation)
- [Database Schema](#database-schema)
- [Docker Setup](#docker-setup)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring & Health Checks](#monitoring--health-checks)
- [Error Budget Policy](#error-budget-policy)
- [Contributing](#contributing)

## 🏁 Quick Start

### Prerequisites
- Node.js 18+ 
- MySQL 8.0+
- Docker & Docker Compose (optional)

### Local Development

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd notes
npm install
```

2. **Set up MySQL database:**
```sql
CREATE DATABASE notes_app;
```

3. **Configure environment variables:**
```bash
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=notes_app
```

4. **Start the application:**
```bash
npm run dev  # Development mode with nodemon
npm start    # Production mode
```

5. **Access the application:**
   - Web UI: http://localhost:3000
   - Health Check: http://localhost:3000/health

### Docker Development

```bash
docker-compose up -d
```

## 📁 Project Structure

```
notes/
├── index.js                 # Main application server
├── package.json             # Node.js dependencies and scripts
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Development environment setup
├── healthcheck.js          # Docker health check script
├── README.md               # This documentation
├── public/
│   └── index.html          # Bootstrap frontend
├── .github/workflows/
│   └── ci.yml              # GitHub Actions CI/CD pipeline
├── tests/                  # Test files (to be created)
└── docs/                   # Additional documentation
```

## 🔗 API Endpoints

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| GET | `/` | Serve frontend application | - |
| GET | `/api/notes` | Get all notes | - |
# Event Booking API

Backend application that lets users browse events, view available seats, and make reservations. Bookings use database transactions to prevent overbooking.

## Features

- Create, read, update, delete events
- Track seats available per event
- Create users (basic identification)
- Make bookings with transactional safety (prevents overbooking)
- List bookings by event or by user
- Health check endpoint

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8+
- (Optional) Docker & Docker Compose

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Create the database (example):
```sql
CREATE DATABASE event_booking;
```

3. Set environment variables (optional - defaults are provided):
```bash
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=your_password
export DB_NAME=event_booking
```

4. Start the server:
```bash
npm run dev    # nodemon (dev)
npm start      # production
```

5. API is available at `http://localhost:3000` and health at `/health`.

## API Endpoints

- GET `/` — Serve frontend (if `public/index.html` exists)
- GET `/health` — Health check

Events:
- GET `/api/events` — List events
- GET `/api/events/:id` — Get event details (includes `seats_available`)
- POST `/api/events` — Create event `{ name, description, total_seats }`
- PUT `/api/events/:id` — Update event (can change `total_seats`, validated against already booked seats)
- DELETE `/api/events/:id` — Delete event
- GET `/api/events/:id/bookings` — List bookings for an event

Users:
- POST `/api/users` — Create user `{ name, email }`
- GET `/api/users/:id` — Get user
- GET `/api/users/:id/bookings` — List bookings for a user

Bookings:
- POST `/api/bookings` — Create booking `{ user_id, event_id, seats }` (transactional)
- GET `/api/bookings` — List all bookings

## Database Schema (created automatically on startup)

Events table:
```sql
CREATE TABLE events (
   id INT AUTO_INCREMENT PRIMARY KEY,
   name VARCHAR(255) NOT NULL,
   description TEXT,
   total_seats INT NOT NULL,
   seats_available INT NOT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Users table:
```sql
CREATE TABLE users (
   id INT AUTO_INCREMENT PRIMARY KEY,
   name VARCHAR(255) NOT NULL,
   email VARCHAR(255) UNIQUE NOT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Bookings table:
```sql
CREATE TABLE bookings (
   id INT AUTO_INCREMENT PRIMARY KEY,
   user_id INT NOT NULL,
   event_id INT NOT NULL,
   seats_reserved INT NOT NULL,
   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Booking Safety

When creating a booking, the server:

1. Starts a database transaction
2. Locks the event row (`SELECT ... FOR UPDATE`)
3. Verifies `seats_available >= seats` requested
4. Deducts seats and inserts the booking
5. Commits the transaction

This prevents race conditions and overbooking even under concurrent requests.

## Running with Docker

The project includes a `Dockerfile` and `docker-compose.yml` (if present). Example:

```bash
docker-compose up -d
```

## Next Steps / Improvements

- Add authentication (JWT / sessions)
- Add tests for booking concurrency
- Add input validation (e.g. with `express-validator`)
- Add connection pooling for scale
- Add logging and monitoring (Prometheus / Grafana)

## Contact

Open an issue or PR for improvements.

Last updated: 2025
