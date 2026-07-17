import jwt from "jsonwebtoken";

export const AuthApi = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    // If no access token is found in cookies
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No token provided.",
      });
    }

    // Verify the access token
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET);

    // Attach user data from the JWT payload to the request object.
    // the JWT carries user info, so downstream
    // handlers (like getAuthStatus) never need to hit the database.
    req.userid = decoded.id;
    req.userName = decoded.name;
    req.userEmail = decoded.email;

    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token.",
    });
  }
};
