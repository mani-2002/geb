const jwt = require("jsonwebtoken");
const secretKey = "yourSecretKey";

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).send(`
      <div style="text-align:center">
        <div style="color: red;">You are unauthorized. Please login first.</div>
      </div>
    `);
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.user = user;
    next();
  });
}
// Function to generate unique transaction ID
function generateUniqueTransactionId() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const randomDigits = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `TRANS${timestamp}${randomDigits}`;
}
module.exports = {
  authenticateToken,
  generateUniqueTransactionId,
};
