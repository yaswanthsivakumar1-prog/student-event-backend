const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/Users");

async function createAdmin() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected!");

        const adminUsername = "admin";
        const adminEmail = "admin@example.com";
        const adminPassword = "adminpassword123";

        // Check if admin already exists
        const existingAdmin = await User.findOne({ username: adminUsername });
        if (existingAdmin) {
            console.log(`⚠️ Admin user '${adminUsername}' already exists.`);
            // Update role to admin just in case
            existingAdmin.role = "admin";
            await existingAdmin.save();
            console.log("👉 Ensured existing admin user has the 'admin' role.");
            
            console.log("\n🔑 You can log in using:");
            console.log(`   Username: ${adminUsername}`);
            console.log(`   Password: (the password you set for this user previously)`);
        } else {
            console.log(`Creating new admin user '${adminUsername}'...`);
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            
            const adminUser = new User({
                firstName: "Admin",
                name: "Admin User",
                username: adminUsername,
                email: adminEmail,
                password: hashedPassword,
                role: "admin"
            });

            await adminUser.save();
            console.log("✅ Admin user created successfully!");
            console.log("\n🔑 Use these credentials to log in:");
            console.log(`   Username: ${adminUsername}`);
            console.log(`   Password: ${adminPassword}`);
        }
    } catch (error) {
        console.error("❌ Error creating admin user:", error);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB.");
    }
}

createAdmin();
