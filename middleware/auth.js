const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
    const authHeader = req.header('Authorization');

    if (!authHeader) {
        return res.status(401).json({ message: "Access Denied. No token provided." });
    }
    const token = authHeader.split(" ")[1];
    try {

        const verifiedData = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verifiedData;

        next();

    } catch (error) {
        res.status(400).json({ message: "Invalid or expired token." });
    }
}
module.exports = verifyToken;
