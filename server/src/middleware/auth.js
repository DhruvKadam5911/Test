import jwt from "jsonwebtoken";

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required. Please log in." });
  }

  jwt.verify(token, process.env.JWT_SECRET || "onion_secret", (err, decodedUser) => {
    if (err) {
      return res.status(401).json({ error: "Invalid or expired access token." });
    }
    req.user = decodedUser;
    next();
  });
}

export default authenticateToken;
