import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import userModel from "../models/User.js";

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

// --- Token Generators ---

// Access Token: Short-lived, carries user data so we never need a DB call to verify identity
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    process.env.TOKEN_SECRET,
    { expiresIn: "1h" },
  );
};

// Refresh Token: Long-lived, minimal payload, stored in DB for revocation
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

// --- Cookie Options ---

const getAccessCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    maxAge: ONE_HOUR_IN_MS,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
  };
};

// The 'secure' flag tells the browser to only send the cookie over HTTPS for production
// The 'sameSite' flag is a security measure to prevent CSRF attacks.
// 'None' is required for cross-site cookies (when frontend and backend are on different domains).
// 'secure: true' is mandatory when using sameSite: 'None'.
const getRefreshCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    maxAge: SEVEN_DAYS_IN_MS,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
  };
};

// Helper: Hash a token before storing in DB
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Helper: Issue both tokens and set cookies
const issueTokens = async (res, user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store hashed refresh token in DB (never store raw tokens)
  user.refreshToken = hashToken(refreshToken);
  await user.save();

  return res
    .cookie("token", accessToken, getAccessCookieOptions())
    .cookie("refreshToken", refreshToken, getRefreshCookieOptions());
};

// --------- Endpoints ---------

export const Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "please fill all the required field",
        success: false,
      });
    }

    const checkUserExist = await userModel.findOne({ email });

    if (!checkUserExist) {
      return res
        .status(400)
        .json({ message: "user does not exist", success: false });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      checkUserExist.password,
    );

    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ message: "password is incorrect", success: false });
    }

    const response = await issueTokens(res, checkUserExist);
    return response.status(200).json({
      message: "user login successfully",
      success: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message, success: false });
  }
};

export const Signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({
        message: "please fill all the required field",
        success: false,
      });
    }

    const checkUserExist = await userModel.findOne({ email });

    if (checkUserExist) {
      return res
        .status(400)
        .json({ message: "user already exist", success: false });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);

    const newUser = new userModel({
      name,
      email,
      password: hashPassword,
    });

    await newUser.save();

    const response = await issueTokens(res, newUser);
    return response.status(201).json({
      message: "user created successfully",
      success: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message, success: false });
  }
};

export const Logout = async (req, res) => {
  try {
    // Try to revoke the refresh token in DB.
    // We decode the refresh token (not access token) because the access token
    // might already be expired when the user clicks "logout".
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      try {
        const decoded = jwt.verify(
          refreshToken,
          process.env.REFRESH_TOKEN_SECRET,
        );
        await userModel.findByIdAndUpdate(decoded.id, { refreshToken: null });
      } catch {
        // Token is invalid/expired — that's fine, just clear cookies
      }
    }

    return res
      .cookie("token", "", {
        ...getAccessCookieOptions(),
        expires: new Date(0),
      })
      .cookie("refreshToken", "", {
        ...getRefreshCookieOptions(),
        expires: new Date(0),
      })
      .json({
        message: "Logged out successfully",
        success: true,
      });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: error.message, success: false });
  }
};

// getAuthStatus: reads user data directly from the verified JWT
export const getAuthStatus = async (req, res) => {
  // The AuthApi middleware already verified the token and extracted user data.
  // We just return it — without DB calls
  res.status(200).json({
    success: true,
    user: {
      id: req.userid,
      name: req.userName,
      email: req.userEmail,
    },
  });
};

// refreshToken: Verify refresh token, check DB, rotate both tokens
export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "No refresh token provided.",
      });
    }

    // 1. Verify the refresh token signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token.",
      });
    }

    // 2. Find the user and check the stored hash matches (DB call is OK here — this runs rarely)
    const user = await userModel.findById(decoded.id);

    if (!user || !user.refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token has been revoked.",
      });
    }

    // 3. Compare hashes to ensure this exact token was issued by us
    const tokenHash = hashToken(refreshToken);
    if (tokenHash !== user.refreshToken) {
      // Possible token theft — revoke all sessions for safety
      user.refreshToken = null;
      await user.save();
      return res.status(401).json({
        success: false,
        message: "Refresh token reuse detected. All sessions revoked.",
      });
    }

    // 4. Rotate: issue new access + refresh tokens (old refresh token is now invalid)
    const response = await issueTokens(res, user);
    return response.status(200).json({
      success: true,
      message: "Tokens refreshed successfully.",
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};
