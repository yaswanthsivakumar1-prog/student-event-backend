const mongoose = require("mongoose");

const userschema = new mongoose.Schema({

    firstName: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true,
    },
    profileImage: {
        type: String,
        default: ''
    },
    role: {
        type: String,
        enum: ['student', 'admin'],
        default: 'student',
    }
}, { timestamps: true });

module.exports = mongoose.model("User", userschema);
