/**
 * db-check.js — Database Inspection & Cleanup Script
 * Run with: node db-check.js
 *
 * This script will:
 *  1. Show all Users (flag old ones missing username)
 *  2. Show all Events
 *  3. Show all Registrations (flag orphaned ones)
 *  4. Remove old Users that are missing the username field
 *  5. Remove orphaned Registrations whose user/event no longer exists
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");

// ── Models ────────────────────────────────────────────────────────────────────
const User = require("./models/Users");
const Event = require("./models/Events");
const Registration = require("./models/Registration");

// ── Helpers ───────────────────────────────────────────────────────────────────
const LINE = "─".repeat(60);
const fmt = (obj) => JSON.stringify(obj, null, 2);

async function run() {
    console.log("\n🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected!\n");

    // ── 1. USERS ──────────────────────────────────────────────────────────────
    console.log(LINE);
    console.log("👥  USERS");
    console.log(LINE);

    const users = await User.find().lean();
    const oldUsers = [];

    if (users.length === 0) {
        console.log("  (no users found)\n");
    } else {
        users.forEach((u, i) => {
            const missing = [];
            if (!u.username) missing.push("username");
            if (!u.firstName) missing.push("firstName");

            const status = missing.length
                ? `⚠️  MISSING: [${missing.join(", ")}]`
                : "✅ OK";

            console.log(`\n  [${i + 1}] ${status}`);
            console.log(`       _id      : ${u._id}`);
            console.log(`       name     : ${u.name || "(none)"}`);
            console.log(`       firstName: ${u.firstName || "(none)"}`);
            console.log(`       username : ${u.username || "(none)"}`);
            console.log(`       email    : ${u.email}`);
            console.log(`       created  : ${u.createdAt}`);

            if (missing.length) oldUsers.push(u._id);
        });
    }

    // ── 2. EVENTS ─────────────────────────────────────────────────────────────
    console.log("\n" + LINE);
    console.log("📅  EVENTS");
    console.log(LINE);

    const events = await Event.find().lean();

    if (events.length === 0) {
        console.log("  (no events found)\n");
    } else {
        events.forEach((ev, i) => {
            console.log(`\n  [${i + 1}] ✅ ${ev.name}`);
            console.log(`       _id      : ${ev._id}`);
            console.log(`       date     : ${ev.date}`);
            console.log(`       location : ${ev.location}`);
            console.log(`       capacity : ${ev.registeredCount}/${ev.capacity}`);
        });
    }

    // ── 3. REGISTRATIONS ─────────────────────────────────────────────────────
    console.log("\n" + LINE);
    console.log("📋  REGISTRATIONS");
    console.log(LINE);

    const registrations = await Registration.find().lean();
    const orphanedRegs = [];
    const userIds = new Set(users.map((u) => u._id.toString()));
    const eventIds = new Set(events.map((e) => e._id.toString()));

    if (registrations.length === 0) {
        console.log("  (no registrations found)\n");
    } else {
        registrations.forEach((r, i) => {
            const userExists = userIds.has(r.userId.toString());
            const eventExists = eventIds.has(r.eventId.toString());
            const isOrphaned = !userExists || !eventExists;

            const status = isOrphaned
                ? `⚠️  ORPHANED (user:${userExists ? "✓" : "✗"} event:${eventExists ? "✓" : "✗"})`
                : "✅ OK";

            console.log(`\n  [${i + 1}] ${status}`);
            console.log(`       _id    : ${r._id}`);
            console.log(`       userId : ${r.userId}`);
            console.log(`       eventId: ${r.eventId}`);
            console.log(`       status : ${r.status}`);

            if (isOrphaned) orphanedRegs.push(r._id);
        });
    }

    // ── 4. SUMMARY ───────────────────────────────────────────────────────────
    console.log("\n" + LINE);
    console.log("📊  SUMMARY");
    console.log(LINE);
    console.log(`  Total Users        : ${users.length}`);
    console.log(`  ⚠️  Old/Incomplete  : ${oldUsers.length}`);
    console.log(`  Total Events       : ${events.length}`);
    console.log(`  Total Registrations: ${registrations.length}`);
    console.log(`  ⚠️  Orphaned Regs   : ${orphanedRegs.length}`);

    // ── 5. CLEANUP ───────────────────────────────────────────────────────────
    if (oldUsers.length === 0 && orphanedRegs.length === 0) {
        console.log("\n🎉 Database is clean — nothing to remove!\n");
    } else {
        console.log("\n🧹 CLEANING UP...\n");

        if (oldUsers.length > 0) {
            const result = await User.deleteMany({ _id: { $in: oldUsers } });
            console.log(`  ✅ Removed ${result.deletedCount} old user(s) missing username/firstName`);

            // Also remove their registrations
            const regResult = await Registration.deleteMany({ userId: { $in: oldUsers } });
            if (regResult.deletedCount > 0) {
                console.log(`  ✅ Removed ${regResult.deletedCount} registration(s) belonging to deleted users`);
            }
        }

        if (orphanedRegs.length > 0) {
            const result = await Registration.deleteMany({ _id: { $in: orphanedRegs } });
            console.log(`  ✅ Removed ${result.deletedCount} orphaned registration(s)`);
        }

        console.log("\n✅ Cleanup complete!\n");
    }

    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB.\n");
}

run().catch((err) => {
    console.error("❌ Error:", err.message);
    mongoose.disconnect();
    process.exit(1);
});
