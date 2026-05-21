const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require('multer');
require("dotenv").config({ path: path.join(__dirname, ".env") });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is not set. Login/signup will fail on Render.");
}

const Event = require("./models/Events");
const User = require("./models/Users");
const verifyToken = require("./middleware/auth.js");
const verifyAdmin = require("./middleware/adminAuth.js");
const Registration = require('./models/Registration');

const app = express();

// CORS configuration - allow frontend origin
app.use(cors({
    origin: true,
    credentials: true
}));

app.options(/.*/, cors());
app.use(express.json());

// ✅ ADD THESE RIGHT HERE
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    cb(null, allowed.test(file.mimetype));
  }
});

// ===== DATABASE CONNECTION =====
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/student-events").then(() => {
    console.log("✅ Connected to MongoDB");
}).catch(err => {
    console.error("❌ MongoDB connection error:", err);
});



// ===== EVENT ROUTES =====

// Get all events
app.get("/api/events", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ message: "Database not connected" });
        }
        const allevents = await Event.find();
        res.json(allevents);

    } catch (err) {
        return res.status(500).json({ message: "something went wrong while fetching events" })
    }
})

// Create event (ADMIN ONLY)
app.post('/api/events', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, date, time, location, description, capacity } = req.body;

        // Validate required fields
        if (!name || !date || !time || !location || !description || !capacity) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const newEvent = new Event({
            name,
            date,
            time,
            location,
            description,
            capacity,
            registeredCount: 0,
            image: req.file ? `/uploads/${req.file.filename}` : null,
            createdBy: req.user.userId  // Admin user creating the event
        });

        await newEvent.save();
        res.status(201).json(newEvent);
    } catch (error) {
        console.error("CREATE EVENT ERROR:", error);
        return res.status(400).json({ message: "Failed to create event", error: error.message });
    }
});

// Search events
// URL will look like: /api/events/search?q=tech
app.get('/api/events/search', async (req, res) => {
    try {
        // 1. Get the search word from the URL
        const searchWord = req.query.q;

        // If they clicked search but the box was empty, just send all events
        if (!searchWord) {
            const allEvents = await Event.find();
            return res.json(allEvents);
        }

        // 2. Search the database!
        // $or means: "Find events where the NAME matches OR the DESCRIPTION matches"
        // $regex does a partial match ("tech" finds "Technology")
        // $options: 'i' means case-insensitive ("tech" finds "Tech", "TECH", "tech")
        const searchResults = await Event.find({
            $or: [
                { name: { $regex: searchWord, $options: 'i' } },
                { description: { $regex: searchWord, $options: 'i' } }
            ]
        });

        // 3. Send the matching events back to the frontend
        res.json(searchResults);

    } catch (error) {
        res.status(500).json({ message: "Error searching for events" });
    }
});

// Get single event
app.get("/api/events/:id", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(500).json({ message: "Database not connected" });
        }

        // Validate if ID is a valid MongoDB ObjectId
        if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({ message: "Invalid event ID format" });
        }

        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }
        res.json(event);
    } catch (err) {
        console.error("GET EVENT ERROR:", err);
        res.status(500).json({ message: "Failed to fetch event", error: err.message });
    }
});

// Update event (ADMIN ONLY)
app.put('/api/events/:id', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, date, time, location, description, capacity } = req.body;
        const eventId = req.params.id;

        const updateData = {};
        if (name) updateData.name = name;
        if (date) updateData.date = date;
        if (time) updateData.time = time;
        if (location) updateData.location = location;
        if (description) updateData.description = description;
        if (capacity) updateData.capacity = capacity;
        if (req.file) updateData.image = `/uploads/${req.file.filename}`;

        const event = await Event.findByIdAndUpdate(eventId, updateData, { new: true });
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        res.json({ message: "Event updated successfully", event });
    } catch (error) {
        console.error("UPDATE EVENT ERROR:", error);
        res.status(400).json({ message: "Failed to update event", error: error.message });
    }
});

// Delete event (ADMIN ONLY)
app.delete('/api/events/:id', verifyAdmin, async (req, res) => {
    try {
        const eventId = req.params.id;

        const event = await Event.findByIdAndDelete(eventId);
        if (!event) {
            return res.status(404).json({ message: "Event not found" });
        }

        // Also delete all registrations for this event
        await Registration.deleteMany({ eventId });

        res.json({ message: "Event deleted successfully" });
    } catch (error) {
        res.status(400).json({ message: "Failed to delete event", error: error.message });
    }
});

// ===== AUTH ROUTES =====

//user signup code
app.post("/api/signup", async (req, res) => {
    try {
        const { firstName, username, email, password } = req.body;

        if (!firstName || !username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check if email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Check if username already taken
        const existingUsername = await User.findOne({ username: username.toLowerCase() });
        if (existingUsername) {
            return res.status(400).json({ message: "Username already taken" });
        }

        const hashedPass = await bcrypt.hash(password, 10);

        const newUser = new User({
            firstName,
            name: firstName,          // name used for display
            username: username.toLowerCase(),
            email,
            password: hashedPass,
            role: 'student'  // Default role
        });

        await newUser.save();

        if (!JWT_SECRET) {
            return res.status(500).json({ message: "Server misconfiguration: JWT_SECRET is missing" });
        }

        const token = jwt.sign({ userId: newUser._id, role: newUser.role }, JWT_SECRET, { expiresIn: "30d" });

        res.status(201).json({
            token,
            user: {
                id: newUser._id,
                firstName: newUser.firstName,
                name: newUser.name,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (err) {
        console.error("SIGNUP ERROR:", err);
        res.status(500).json({ message: "something went wrong while signing up", error: err.message });
    }
});

//user login code - login with username + password
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) {
            return res.status(400).json({ message: "Invalid username or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid username or password" });
        }

        if (!JWT_SECRET) {
            return res.status(500).json({ message: "Server misconfiguration: JWT_SECRET is missing" });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: "30d" });
        res.json({
            token: token,
            user: {
                id: user._id,
                firstName: user.firstName,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Server error during login" });
    }

})

// ===== PROFILE & USER ROUTES =====

//verify token

app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Error fetching profile" });
    }
});

app.put('/api/profile', verifyToken, upload.single('profileImage'), async (req, res) => {
  try {
    const { name } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (req.file) updates.profileImage = `/uploads/${req.file.filename}`;

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true }
    ).select('-password');

    res.json({ message: 'Profile updated!', user: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});


//get all users (ADMIN ONLY)
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Error fetching users" });
    }
});

//admin create new user (ADMIN ONLY)
app.post("/api/admin/users", verifyAdmin, async (req, res) => {
    try {
        const { firstName, username, email, password, role } = req.body;

        if (!firstName || !username || !email || !password) {
            return res.status(400).json({ message: "firstName, username, email, and password are required" });
        }

        // Check if email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Check if username already taken
        const existingUsername = await User.findOne({ username: username.toLowerCase() });
        if (existingUsername) {
            return res.status(400).json({ message: "Username already taken" });
        }

        const hashedPass = await bcrypt.hash(password, 10);

        const newUser = new User({
            firstName,
            name: firstName,
            username: username.toLowerCase(),
            email,
            password: hashedPass,
            role: role && ['admin', 'student'].includes(role) ? role : 'student'
        });

        await newUser.save();

        res.status(201).json({
            id: newUser._id,
            firstName: newUser.firstName,
            name: newUser.name,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role
        });

    } catch (err) {
        console.error("CREATE USER ERROR:", err);
        res.status(500).json({ message: "Error creating user", error: err.message });
    }
})

// Change user role (ADMIN ONLY)
app.patch('/api/users/:id/role', verifyAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        const userId = req.params.id;

        if (!role || !['admin', 'student'].includes(role)) {
            return res.status(400).json({ message: "Valid role (admin/student) is required" });
        }

        const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select('-password');
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User role updated successfully", user });
    } catch (error) {
        res.status(400).json({ message: "Failed to update user role", error: error.message });
    }
});

// Delete user (ADMIN ONLY)
app.delete('/api/admin/users/:id', verifyAdmin, async (req, res) => {
    try {
        const userId = req.params.id;

        // Validate if ID is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
        }

        // Prevent self-deletion
        if (userId === req.user.userId) {
            return res.status(400).json({ message: "Admins cannot delete their own account from the dashboard" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Find user's registrations and decrement registeredCount for their events
        const registrations = await Registration.find({ userId });
        for (const reg of registrations) {
            if (reg.eventId) {
                await Event.findByIdAndUpdate(
                    reg.eventId,
                    { $inc: { registeredCount: -1 } },
                    { new: true }
                );
            }
        }

        // Delete user's registrations
        await Registration.deleteMany({ userId });

        // Delete the user
        await User.findByIdAndDelete(userId);

        res.json({ message: "User and their registrations deleted successfully" });
    } catch (error) {
        console.error("DELETE USER ERROR:", error);
        res.status(500).json({ message: "Failed to delete user", error: error.message });
    }
});


// Get admin dashboard stats (ADMIN ONLY)
app.get('/api/admin/dashboard', verifyAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalAdmins = await User.countDocuments({ role: 'admin' });
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalEvents = await Event.countDocuments();
        const totalRegistrations = await Registration.countDocuments();

        res.json({
            totalUsers,
            totalAdmins,
            totalStudents,
            totalEvents,
            totalRegistrations
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching dashboard stats", error: error.message });
    }
});

// Get a specific user's registrations (ADMIN ONLY)
app.get('/api/admin/users/:id/registrations', verifyAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const registrations = await Registration.find({ userId })
            .populate('eventId')
            .sort({ createdAt: -1 });

        res.json(registrations);
    } catch (error) {
        res.status(500).json({ message: "Error fetching user registrations", error: error.message });
    }
});

// ===== REGISTRATION ROUTES =====

// Register for an event
app.post('/api/events/:id/register', verifyToken, async (req, res) => {
    try {
        const eventId = req.params.id;
        const userId = req.user.userId; // verifyToken gives us this!

        // ✅ Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ message: "Invalid event id format" });
        }

        // 1. Find the event
        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: "Event not found" });

        // 2. Check if the event is full (Backend Validation is crucial!)
        if (event.registeredCount >= event.capacity) {
            return res.status(400).json({ message: "Sorry, this event is full!" });
        }

        // 3. Check if the user is ALREADY registered
        const existingRegistration = await Registration.findOne({ userId, eventId });
        if (existingRegistration) {
            return res.status(400).json({ message: "You are already registered!" });
        }

        // 4. Create the new Registration (Put them on the guest list)
        const newRegistration = new Registration({ userId, eventId });
        await newRegistration.save();

        // 5. ✅ Use findByIdAndUpdate to avoid validation errors
        await Event.findByIdAndUpdate(
            eventId,
            { $inc: { registeredCount: 1 } },
            { new: true }
        );

        res.status(201).json({ message: "Successfully registered!" });

    } catch (error) {
        console.error('POST /api/events/:id/register error:', error);
        res.status(500).json({ message: "Server error during registration", error: error.message });
    }
});

// Get all registrations for the logged-in user
app.get('/api/my-registrations', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const myRegistrations = await Registration.find({ userId })
            .populate('eventId')  // ✅ pulls full event data in one query
            .sort({ createdAt: -1 });

        res.json(myRegistrations);
    } catch (error) {
        res.status(500).json({ message: "Error fetching your registrations" });
    }
});

//delete registration
app.delete('/api/registrations/:id', verifyToken, async (req, res) => {
    try {
        const registrationId = req.params.id;
        const userId = req.user.userId;

        // ✅ Validate ObjectId format before querying
        if (!mongoose.Types.ObjectId.isValid(registrationId)) {
            return res.status(400).json({ message: "Invalid registration id format" });
        }

        // First, check if registration exists
        const registration = await Registration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({ message: "Registration not found" });
        }

        // ✅ Check ownership - convert ObjectId to string for comparison
        const registrationUserId = registration.userId.toString();
        const currentUserId = userId.toString();
        
        if (registrationUserId !== currentUserId) {
            return res.status(403).json({ message: "Not authorized to cancel this registration" });
        }

        // ✅ Use findByIdAndUpdate to avoid full validation
        if (registration.eventId) {
            await Event.findByIdAndUpdate(
                registration.eventId,
                { $inc: { registeredCount: -1 } },
                { new: true }
            );
        }

        await Registration.findByIdAndDelete(registrationId);

        // 5. Send success message back to the frontend
        res.json({ message: "Successfully unregistered!" });
    } catch (err) {
        // ✅ Log the error for debugging
        console.error('DELETE /api/registrations/:id error:', err);
        res.status(500).json({ message: "Error cancelling registration", error: err.message });
    }
})

// Get all registrations for a specific event (ADMIN ONLY)
app.get('/api/admin/events/:id/registrations', verifyAdmin, async (req, res) => {
    try {
        const eventId = req.params.id;

        const registrations = await Registration.find({ eventId })
            .populate('userId', 'firstName name email username')
            .populate('eventId')
            .sort({ createdAt: -1 });

        if (!registrations) {
            return res.status(404).json({ message: "No registrations found for this event" });
        }

        res.json(registrations);
    } catch (error) {
        res.status(500).json({ message: "Error fetching event registrations", error: error.message });
    }
});

// Force cancel a registration (ADMIN ONLY)
app.delete('/api/admin/registrations/:id', verifyAdmin, async (req, res) => {
    try {
        const registrationId = req.params.id;

        // ✅ Validate ObjectId format before querying
        if (!mongoose.Types.ObjectId.isValid(registrationId)) {
            return res.status(400).json({ message: "Invalid registration id format" });
        }

        const registration = await Registration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({ message: "Registration not found" });
        }

        // ✅ Use findByIdAndUpdate to avoid full validation
        if (registration.eventId) {
            await Event.findByIdAndUpdate(
                registration.eventId,
                { $inc: { registeredCount: -1 } },
                { new: true }
            );
        }

        // Delete the registration
        await Registration.findByIdAndDelete(registrationId);

        res.json({ message: "Registration cancelled by admin successfully" });
    } catch (error) {
        // ✅ Log the error for debugging
        console.error('DELETE /api/admin/registrations/:id error:', error);
        res.status(500).json({ message: "Error cancelling registration", error: error.message });
    }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
        console.log(`🚀 Server is running on http://localhost:${PORT}`);
});


