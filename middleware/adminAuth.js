    const jwt = require('jsonwebtoken');

// Middleware to verify if user is an admin
function verifyAdmin(req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ message: "Access Denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];

    try {
        const verifiedData = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user has admin role
        if (verifiedData.role !== 'admin') {
            return res.status(403).json({ message: "Access Denied. Admin privileges required." });
        }

        req.user = verifiedData;
        next();

    } catch (error) {
        res.status(400).json({ message: "Invalid or expired token." });
    }
}

module.exports = verifyAdmin;
