const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { logAudit } = require("../utils/auditLogger");
const { assertPasswordPolicy } = require("../utils/identityService");

function formatRoleLabel(role = "") {
  return role
    .split("_")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildAvatarUrl(avatarPath) {
  if (!avatarPath) {
    return null;
  }

  if (/^https?:\/\//i.test(avatarPath)) {
    return avatarPath;
  }

  return `http://localhost:${process.env.PORT || 5000}${avatarPath}`;
}

function buildUserResponse(user) {
  const fullName = [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: user.id,
    employee_or_student_id: user.employee_or_student_id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    middle_name: user.middle_name,
    full_name: fullName,
    email: user.email,
    role: user.role,
    role_label: formatRoleLabel(user.role),
    status: user.status,
    phone_number: user.phone_number || null,
    address: user.address || null,
    avatar_path: user.avatar_path || null,
    avatar_url: buildAvatarUrl(user.avatar_path)
  };
}

async function enrichUserProfile(user) {
  if (!user || user.role !== "parent") {
    return user;
  }

  const [parentRows] = await pool.query(
    `
    SELECT id, phone_number, address
    FROM parents
    WHERE user_id = ?
    LIMIT 1
    `,
    [user.id]
  );

  if (!parentRows.length) {
    return user;
  }

  return {
    ...user,
    phone_number: parentRows[0].phone_number || null,
    address: parentRows[0].address || null,
    parent_record_id: parentRows[0].id
  };
}

async function fetchUserById(userId) {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, employee_or_student_id, first_name, last_name, middle_name, email, username, role, status, avatar_path
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    return rows;
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const [rows] = await pool.query(
        `
        SELECT id, employee_or_student_id, first_name, last_name, middle_name, email, username, role, status
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [userId]
      );

      return rows.map(row => ({
        ...row,
        avatar_path: null
      }));
    }

    throw error;
  }
}

async function login(req, res) {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "Username/email and password are required."
      });
    }

    const [rows] = await pool.query(
      `
      SELECT *
      FROM users
      WHERE (username = ? OR email = ?)
      LIMIT 1
      `,
      [usernameOrEmail, usernameOrEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials."
      });
    }

    const user = rows[0];

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials."
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    await logAudit({
      userId: user.id,
      action: "LOGIN",
      targetTable: "users",
      targetId: user.id,
      details: `User ${user.username} logged in`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: buildUserResponse(user)
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login."
    });
  }
}

async function getMe(req, res) {
  try {
    const rows = await fetchUserById(req.user.id);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    return res.json({
      success: true,
      user: buildUserResponse(await enrichUserProfile(rows[0]))
    });
  } catch (error) {
    console.error("Get me error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error."
    });
  }
}

async function getMyNotifications(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, title, message, type, is_read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    return res.json({
      success: true,
      notifications: rows,
      unreadCount: rows.filter(row => !row.is_read).length
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching notifications."
    });
  }
}

async function markNotificationAsRead(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
      `,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found."
      });
    }

    return res.json({
      success: true,
      message: "Notification marked as read."
    });
  } catch (error) {
    console.error("Mark notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notification."
    });
  }
}

async function markAllNotificationsAsRead(req, res) {
  try {
    await pool.query(
      `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ?
      `,
      [req.user.id]
    );

    return res.json({
      success: true,
      message: "All notifications marked as read."
    });
  } catch (error) {
    console.error("Mark all notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notifications."
    });
  }
}

async function deleteNotification(req, res) {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      `
      DELETE FROM notifications
      WHERE id = ? AND user_id = ?
      `,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found."
      });
    }

    return res.json({
      success: true,
      message: "Notification deleted successfully."
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting notification."
    });
  }
}

async function clearMyNotifications(req, res) {
  try {
    await pool.query(
      `
      DELETE FROM notifications
      WHERE user_id = ?
      `,
      [req.user.id]
    );

    return res.json({
      success: true,
      message: "Notification history cleared successfully."
    });
  } catch (error) {
    console.error("Clear notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while clearing notifications."
    });
  }
}

async function updateMyProfile(req, res) {
  try {
    const { first_name, middle_name, last_name, email, username, phone_number } = req.body;

    if (!first_name || !last_name || !email || !username) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, and username are required."
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedUsername = String(username).trim();
    const trimmedPhoneNumber = phone_number ? String(phone_number).trim() : "";

    const existingRows = await fetchUserById(req.user.id);
    if (!existingRows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const existingUser = existingRows[0];

    if (existingUser.role === "parent" && !trimmedPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required for parent accounts."
      });
    }

    const [duplicateRows] = await pool.query(
      `
      SELECT id
      FROM users
      WHERE (email = ? OR username = ?)
        AND id <> ?
      LIMIT 1
      `,
      [trimmedEmail, trimmedUsername, req.user.id]
    );

    if (duplicateRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email or username is already being used by another account."
      });
    }

    const connection = await pool.getConnection();
    let rows;
    try {
      await connection.beginTransaction();

      await connection.query(
        `
        UPDATE users
        SET first_name = ?,
            middle_name = ?,
            last_name = ?,
            email = ?,
            username = ?
        WHERE id = ?
        `,
        [
          String(first_name).trim(),
          middle_name ? String(middle_name).trim() : null,
          String(last_name).trim(),
          trimmedEmail,
          trimmedUsername,
          req.user.id
        ]
      );

      if (existingUser.role === "parent") {
        await connection.query(
          `
          UPDATE parents
          SET first_name = ?,
              middle_name = ?,
              last_name = ?,
              email = ?,
              phone_number = ?
          WHERE user_id = ?
          `,
          [
            String(first_name).trim(),
            middle_name ? String(middle_name).trim() : null,
            String(last_name).trim(),
            trimmedEmail,
            trimmedPhoneNumber,
            req.user.id
          ]
        );
      }

      await connection.commit();
      rows = await fetchUserById(req.user.id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await logAudit({
      userId: req.user.id,
      action: "UPDATE_PROFILE",
      targetTable: "users",
      targetId: req.user.id,
      details: `Updated own profile for ${trimmedUsername}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Profile updated successfully.",
      user: buildUserResponse(await enrichUserProfile(rows[0]))
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating profile."
    });
  }
}

async function changeMyPassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required."
      });
    }

    assertPasswordPolicy(newPassword);

    const [rows] = await pool.query(
      `
      SELECT id, username, password_hash
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(currentPassword, user.password_hash);

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect."
      });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    await pool.query(
      `
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
      `,
      [passwordHash, req.user.id]
    );

    await logAudit({
      userId: req.user.id,
      action: "CHANGE_PASSWORD",
      targetTable: "users",
      targetId: req.user.id,
      details: `Changed password for ${user.username}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Password updated successfully."
    });
  } catch (error) {
    console.error("Change password error:", error);
    if (error.message && error.message.includes("Password must be")) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating password."
    });
  }
}

async function uploadMyAvatar(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please choose an avatar image to upload."
      });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    try {
      await pool.query(
        `
        UPDATE users
        SET avatar_path = ?
        WHERE id = ?
        `,
        [avatarPath, req.user.id]
      );
    } catch (error) {
      if (error && error.code === "ER_BAD_FIELD_ERROR") {
        return res.status(500).json({
          success: false,
          message: "Avatar uploads need the profile-settings migration. Please apply 003_profile_settings.sql first."
        });
      }

      throw error;
    }

    const rows = await fetchUserById(req.user.id);

    await logAudit({
      userId: req.user.id,
      action: "UPLOAD_AVATAR",
      targetTable: "users",
      targetId: req.user.id,
      details: `Uploaded avatar for user ${req.user.id}`,
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: "Profile photo updated successfully.",
      user: buildUserResponse(rows[0])
    });
  } catch (error) {
    console.error("Upload avatar error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while uploading avatar."
    });
  }
}

async function getStaffOptions(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT id, first_name, last_name, role, status
      FROM users
      WHERE role IN ('discipline_officer', 'guidance_counselor')
      ORDER BY role, last_name, first_name
      `
    );

    return res.json({
      success: true,
      staff: rows
    });
  } catch (error) {
    console.error("Get staff options error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error."
    });
  }
}

module.exports = {
  login,
  getMe,
  updateMyProfile,
  changeMyPassword,
  uploadMyAvatar,
  getMyNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  deleteNotification,
  clearMyNotifications,
  getStaffOptions
};
