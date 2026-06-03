# VenueFlow 🎟️

A full-stack event ticket booking platform built with NestJS, React, PostgreSQL, and Redis.

VenueFlow allows organizers to create venues, manage seating layouts, publish events, and sell tickets while ensuring seat availability through concurrency-safe booking workflows.

## Live Demo

* Frontend: https://venue-flow-fe-u7po.vercel.app/
* Backend API: https://venue-flow-be.onrender.com
* API Documentation: https://venue-flow-be.onrender.com/docs

---

## Features

### Authentication & Authorization

* JWT Authentication
* Role-Based Access Control (Admin, Organizer, User)
* Protected Routes
* Custom Guards & Decorators

### Venue Management

* Create and Manage Venues
* Create Venue Sections
* Bulk Seat Generation
* Seat Management

### Event Management

* Create Events
* Assign Venues
* Auto Generate Event Seats
* Event Publishing
* Event Listing & Details

### Booking System

* Seat Reservation
* Booking Creation
* Booking Confirmation
* Booking Cancellation
* User Booking History

### Concurrency Handling

* Optimistic Locking using TypeORM Version Columns
* Transaction-Based Booking Operations
* Prevents Double Booking Scenarios

### Performance

* Redis Caching
* Database Indexing
* Pagination Support

### Background Processing

* Scheduled Cron Jobs
* Automatic Seat Release for Expired Reservations

### Deployment

* Dockerized Application
* Frontend and Backend Deployed

---

## Architecture

VenueFlow follows a modular architecture using NestJS.

Users
↓
Authentication
↓
Events
↓
Event Seats
↓
Bookings
↓
Payments (Planned)

Core Modules:

* Auth Module
* Users Module
* Venue Module
* Seats Module
* Events Module
* Booking Module

---

## Tech Stack

### Backend

* NestJS
* TypeScript
* PostgreSQL
* TypeORM
* Redis
* JWT
* Docker

### Frontend

* React
* TypeScript
* React Router
* Axios

### Infrastructure

* Docker
* Redis
* PostgreSQL

---

## Database Design

Key Entities:

* Users
* Venues
* Venue Sections
* Seats
* Events
* Event Seats
* Bookings
* Booking Items

Event seats are generated dynamically for each event, allowing:

* Event-specific pricing
* Event-specific availability
* Independent booking state management

---

## Challenges Solved

### Double Booking Prevention

Implemented optimistic locking and transactional booking workflows to prevent multiple users from reserving the same seat simultaneously.

### Reusable Venue Layouts

Separated physical seats from event-specific seats to allow venues to be reused across multiple events.

### Automated Seat Recovery

Implemented cron-based reservation cleanup to automatically release seats when bookings expire.

---

## Planned Features

### Authentication

* Google OAuth
* Refresh Token Rotation
* Session Management
* Logout From All Devices

### Payments

* Razorpay Integration
* Payment Webhooks
* Payment Verification

### Real-Time Features

* WebSocket Based Seat Updates
* Live Booking Synchronization

### Backend Scalability

* BullMQ
* Redis Distributed Locking
* Audit Logs
* Health Checks
* Structured Logging

### User Experience

* Booking Confirmation Emails
* PDF Ticket Generation
* QR Code Tickets

### Frontend

* Next.js Migration
* SEO Optimizations

---

## Local Development

### Install Dependencies

```bash
npm install
```

### Configure Environment

```env
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
```

### Run Migrations

```bash
npm run migration:run
```

### Start Development Server

```bash
npm run start:dev
```

---

## Future Goals

VenueFlow is being extended into a production-grade ticketing platform with:

* OAuth Authentication
* Payment Processing
* Real-Time Seat Availability
* Distributed Locking
* Event Analytics
* QR Ticket Validation

---

## Author

Ronik Agrawal

Backend Engineer | Full Stack Developer

Built to explore scalable event booking systems, concurrency control, and production-ready backend architecture.
