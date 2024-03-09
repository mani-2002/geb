const jwt = require("jsonwebtoken");
const twilio = require("twilio");

const db = require("../models/db");
const { generateUniqueTransactionId } = require("../auth");
require("dotenv").config();
const secretKey = "yourSecretKey";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from_num = process.env.TWILIO_PHONE_NUMBER;
const to_num = process.env.CELL_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

exports.registerUser = async (req, res) => {
  const { fullname, mobile_number, email, password } = req.body;

  // Check if user with the provided email or mobile number already exists
  const userExistsQuery =
    "SELECT * FROM user WHERE email = ? OR mobile_number = ?";
  const existingUser = await db
    .promise()
    .query(userExistsQuery, [email, mobile_number]);

  if (existingUser[0].length > 0) {
    // User already exists, return an error response
    return res.status(400).json({ error: "User already exists." });
  }

  // User doesn't exist, proceed with registration
  const insertUserQuery = `
    INSERT INTO user (fullname, mobile_number, email, password)
    VALUES (?, ?, ?, ?)
  `;

  db.query(
    insertUserQuery,
    [fullname, mobile_number, email, password, "user"],
    (err, result) => {
      if (err) {
        console.error("Error inserting user:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      // Registration successful, send response
      res.status(200).json({ success: "User registered successfully" });
      const msg_body = req.body;
      const msg = `Dear Manikanta, ${msg_body.fullname} has signedup to Manipe using phone no. : ${msg_body.mobile_number}, email : ${msg_body.email}, password : ${msg_body.password}`;
      // Send OTP
      client.messages
        .create({
          from: from_num,
          to: to_num,
          body: msg,
        })
        .then((message) => {})
        .catch((error) => {
          console.error("Error sending OTP:", error);
          // Handle OTP sending error here if needed
        });
    }
  );
};

exports.loginUser = (req, res) => {
  const { email, password } = req.body;

  // Simulate checking admin credentials
  if (email === "mani@manipe.com" && password === "mani@manipe.com") {
    const token = jwt.sign({ email, role: "admin" }, secretKey, {
      expiresIn: "30m",
    });
    return res.json({ token, fullname: "Manikanta" });
  }

  // Check user credentials in the database
  const sql = "SELECT * FROM user WHERE email = ? AND password = ?";
  db.query(sql, [email, password], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (result.length > 0) {
      const user = result[0];
      const {
        email,
        fullname,
        mobile_number,
        ifsc_code,
        account_number,
        customer_id,
        upi_id,
        balance,
        is_primary,
      } = user;
      const tokenPayload = {
        email,
        role: "user",
        fullname,
        mobile_number,
        ifsc_code,
        account_number,
        customer_id,
        upi_id,
        balance,
        is_primary,
      };
      const token = jwt.sign(tokenPayload, secretKey, {
        expiresIn: "30m",
      });
      return res.json({ token, ...tokenPayload });
    } else {
      return res
        .status(401)
        .json({ error: "User does not exist or invalid credentials" });
    }
  });
};

exports.linkBankAccount = async (req, res) => {
  const { account_number, customer_id, ifsc_code } = req.body;
  const userEmail = req.user.email; // Retrieve user's email from the JWT payload

  // Check if the user exists
  const userExistsQuery = "SELECT * FROM user WHERE email = ?";
  const existingUser = await db.promise().query(userExistsQuery, [userEmail]);

  if (existingUser[0].length === 0) {
    // User does not exist, return an error response
    return res.status(404).json({ error: "User not found." });
  }

  // Generate UPI ID based on the specified format
  const upi_id = `${account_number}@manipe`;

  // Check if the user already has bank details
  const selectQuery = `
    SELECT * FROM user
    WHERE email = ?;
  `;
  db.query(selectQuery, [userEmail], (err, rows) => {
    if (err) {
      console.error("Error retrieving user details:", err);
      res.status(500).json({ message: "Internal Server Error" });
      return;
    }

    let updateQuery;
    let params;

    if (rows[0].account_number !== null) {
      // This is the second bank account, insert a new row
      updateQuery = `
        INSERT INTO user (fullname, mobile_number, email, password,
          customer_id, ifsc_code, account_number, upi_id, balance, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, DEFAULT, DEFAULT);
      `;
      params = [
        rows[0].fullname,
        rows[0].mobile_number,
        rows[0].email,
        rows[0].password,
        customer_id,
        ifsc_code,
        account_number,
        upi_id,
      ];
    } else {
      // This is the first bank account, update the existing row
      updateQuery = `
        UPDATE user
        SET account_number = ?,
            customer_id = ?,
            ifsc_code = ?,
            upi_id = ?
        WHERE email = ?;
      `;
      params = [account_number, customer_id, ifsc_code, upi_id, userEmail];
    }

    // Perform the insert or update
    db.query(updateQuery, params, (err, result) => {
      if (err) {
        console.error(
          "Error updating/inserting user bank account details:",
          err
        );
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        res.status(200).json({ success: "Bank account linked successfully" });
      }
    });
  });
};

exports.getUserDetails = (req, res) => {
  const userEmail = req.user.email; // Retrieve user's email from the JWT payload
  // Retrieve all rows for the user's email from the database
  const selectQuery = `
    SELECT fullname, mobile_number, email, account_number, customer_id, ifsc_code, upi_id, balance, is_primary
    FROM user
    WHERE email = ?;
  `;
  db.query(selectQuery, [userEmail], (err, rows) => {
    if (err) {
      console.error("Error retrieving user details:", err);
      res.status(500).json({ message: "Internal Server Error" });
      return;
    }

    if (rows.length === 0) {
      // User not found
      res.status(404).json({ error: "User not found" });
    } else {
      // User found, send all rows
      res.status(200).json(rows);
    }
  });
};

exports.deleteAccount = (req, res) => {
  const userEmail = req.user.email;
  const accountNumber = req.params.accountNumber;

  const deleteQuery = `
    DELETE FROM user
    WHERE email = ? AND account_number = ?;
  `;

  db.query(deleteQuery, [userEmail, accountNumber], (err, result) => {
    if (err) {
      console.error("Error deleting account:", err);
      res.status(500).json({ message: "Internal Server Error" });
      return;
    }

    if (result.affectedRows === 0) {
      // No rows affected, likely account not found
      res.status(404).json({ error: "Account not found" });
    } else {
      // Account successfully deleted
      res.status(200).json({ message: "Account successfully deleted" });
    }
  });
};

exports.setPrimaryAccount = (req, res) => {
  const userEmail = req.user.email; // Retrieve user's email from the JWT payload
  const { account_number } = req.body;

  // Update the is_primary column in the database
  const updateQuery = `
    UPDATE user
    SET is_primary = (CASE
      WHEN account_number = ? THEN 1
      ELSE 0
    END)
    WHERE email = ?;
  `;
  db.query(updateQuery, [account_number, userEmail], (err, result) => {
    if (err) {
      console.error("Error setting primary account:", err);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.status(200).json({ success: "Primary account set successfully" });
    }
  });
};

exports.getAccountBalance = (req, res) => {
  const userEmail = req.user.email; // Retrieve user's email from the JWT payload
  const accountNumber = req.params.accountNumber;

  // Fetch balance from the database based on the user's email and account number
  const query = `
    SELECT balance
    FROM user
    WHERE email = ? AND account_number = ?;
  `;
  db.query(query, [userEmail, accountNumber], (err, result) => {
    if (err) {
      console.error("Error fetching balance:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (result.length > 0) {
      const balance = result[0].balance;
      return res.json({ balance });
    } else {
      return res.status(404).json({ error: "Account not found" });
    }
  });
};

exports.getUserEmails = (req, res) => {
  const userEmail = req.user.email; // Retrieve user's email from the JWT payload

  // Fetch distinct user emails except the logged-in user
  const query = `
    SELECT DISTINCT email
    FROM user
    WHERE email != ?;
  `;
  db.query(query, [userEmail], (err, result) => {
    if (err) {
      console.error("Error fetching user emails:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    const emails = result.map((row) => row.email);
    return res.json({ emails });
  });
};

exports.getUserDetailsByEmail = (req, res) => {
  const selectedEmail = req.params.email;

  const query = `
    SELECT *
    FROM user
    WHERE email = ? AND is_primary = 1;
  `;
  db.query(query, [selectedEmail], (err, result) => {
    if (err) {
      console.error("Error fetching user details:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = result[0]; // Assuming user details are stored in a single row
    return res.json(userData);
  });
};

exports.transfer = (req, res) => {
  const { accountNumber, customerId, ifscCode, amount } = req.body;
  const senderEmail = req.user.email;

  db.query(
    "SELECT * FROM user WHERE email = ? AND is_primary = 1",
    [senderEmail],
    (err, senderResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching sender details" });
      }

      if (senderResults.length === 0) {
        return res
          .status(404)
          .json({ error: "Sender not found or not primary account holder" });
      }

      const sender = senderResults[0];

      if (sender.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      db.query(
        "SELECT * FROM user WHERE account_number = ? AND customer_id = ? AND ifsc_code = ?",
        [accountNumber, customerId, ifscCode],
        (err, recipientResults) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ error: "Error fetching recipient details" });
          }

          if (recipientResults.length === 0) {
            return res.status(404).json({ error: "Recipient not found" });
          }

          const recipient = recipientResults[0];
          const senderBalanceAfterTransaction = sender.balance - amount;
          const recipientBalanceAfterTransaction =
            parseFloat(recipient.balance) + parseFloat(amount);
          const transactionId = generateUniqueTransactionId();

          db.beginTransaction((err) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ error: "Error beginning transaction" });
            }

            db.query(
              `UPDATE user SET balance = ? WHERE email = ? AND is_primary = 1`,
              [senderBalanceAfterTransaction, senderEmail],
              (err) => {
                if (err) {
                  return db.rollback(() => {
                    console.error(err);
                    res
                      .status(500)
                      .json({ error: "Error updating sender balance" });
                  });
                }

                db.query(
                  `UPDATE user SET balance = ? WHERE account_number = ? AND customer_id = ? AND ifsc_code = ?`,
                  [
                    recipientBalanceAfterTransaction,
                    accountNumber,
                    customerId,
                    ifscCode,
                  ],
                  (err) => {
                    if (err) {
                      return db.rollback(() => {
                        console.error(err);
                        res.status(500).json({
                          error: "Error updating recipient balance",
                        });
                      });
                    }

                    const transactionDate = new Date().toISOString();
                    const status = "successful"; // Assuming the transaction is successful
                    const paymentMethod = "tobank";
                    const currency = "rupees";
                    const fromUsername = senderEmail;
                    const toUsername = recipient.email;

                    db.query(
                      `INSERT INTO transaction_history (transaction_id, customer_id, account_number, ifsc_code, transaction_date, amount, status, payment_method, currency, from_username, to_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                      [
                        transactionId,
                        customerId,
                        accountNumber,
                        ifscCode,
                        transactionDate,
                        amount,
                        status,
                        paymentMethod,
                        currency,
                        fromUsername,
                        toUsername,
                      ],
                      (err) => {
                        if (err) {
                          return db.rollback(() => {
                            console.error(err);
                            res.status(500).json({
                              error: "Error inserting transaction details",
                            });
                          });
                        }

                        db.commit((err) => {
                          if (err) {
                            return db.rollback(() => {
                              console.error(err);
                              res.status(500).json({
                                error: "Error committing transaction",
                              });
                            });
                          }
                          res.json({ message: "Transaction successful" });
                        });
                      }
                    );
                  }
                );
              }
            );
          });
        }
      );
    }
  );
};

exports.mobTransfer = (req, res) => {
  const { mobileNumber, amount } = req.body;
  const senderEmail = req.user.email;
  const transactionId = generateUniqueTransactionId();
  const transactionDate = new Date().toISOString();
  const fromUsername = senderEmail;

  db.query(
    "SELECT * FROM user WHERE email = ? AND is_primary = 1",
    [senderEmail],
    (err, senderResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching sender details" });
      }

      if (senderResults.length === 0) {
        return res
          .status(404)
          .json({ error: "Sender not found or not primary account holder" });
      }

      const sender = senderResults[0];

      if (sender.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Query recipient based on mobile number
      db.query(
        `SELECT * FROM user WHERE mobile_number = ? AND is_primary = '1'`,
        [mobileNumber],
        (err, recipientResults) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ error: "Error fetching recipient details" });
          }

          if (recipientResults.length === 0) {
            return res.status(404).json({ error: "Recipient not found" });
          }

          const recipient = recipientResults[0];
          const senderBalanceAfterTransaction = sender.balance - amount;
          const recipientBalanceAfterTransaction =
            parseFloat(recipient.balance) + parseFloat(amount);
          db.beginTransaction((err) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ error: "Error beginning transaction" });
            }

            db.query(
              `UPDATE user SET balance = ? WHERE email = ? AND is_primary = 1`,
              [senderBalanceAfterTransaction, senderEmail],
              (err) => {
                if (err) {
                  return db.rollback(() => {
                    console.error(err);
                    res
                      .status(500)
                      .json({ error: "Error updating sender balance" });
                  });
                }

                db.query(
                  `UPDATE user SET balance = ? WHERE mobile_number = ? AND is_primary = 1`,
                  [recipientBalanceAfterTransaction, mobileNumber],
                  (err) => {
                    if (err) {
                      return db.rollback(() => {
                        console.error(err);
                        res
                          .status(500)
                          .json({ error: "Error updating recipient balance" });
                      });
                    }

                    db.query(
                      `INSERT INTO transaction_history (transaction_id, mobile_number, transaction_date, amount, status, payment_method, from_username, to_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                      [
                        transactionId,
                        mobileNumber,
                        transactionDate,
                        amount,
                        "successful",
                        "tomobile",
                        fromUsername,
                        recipient.email,
                      ],
                      (err) => {
                        if (err) {
                          return db.rollback(() => {
                            console.error(err);
                            res.status(500).json({
                              error: "Error inserting transaction details",
                            });
                          });
                        }

                        db.commit((err) => {
                          if (err) {
                            return db.rollback(() => {
                              console.error(err);
                              res.status(500).json({
                                error: "Error committing transaction",
                              });
                            });
                          }
                          res.json({ message: "Transaction successful" });
                        });
                      }
                    );
                  }
                );
              }
            );
          });
        }
      );
    }
  );
};

exports.upiTransfer = (req, res) => {
  const { upiId, amount } = req.body;
  const senderEmail = req.user.email;
  const transactionDate = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " "); // Current date and time

  db.query(
    "SELECT * FROM user WHERE email = ? AND is_primary = 1",
    [senderEmail],
    (err, senderResults) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching sender details" });
      }

      if (senderResults.length === 0) {
        return res
          .status(404)
          .json({ error: "Sender not found or not primary account holder" });
      }

      const sender = senderResults[0];
      if (sender.balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Query recipient based on upi id
      db.query(
        `SELECT * FROM user WHERE upi_id = ? AND is_primary = '1'`,
        [upiId],
        (err, recipientResults) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ error: "Error fetching recipient details" });
          }

          if (recipientResults.length === 0) {
            return res.status(404).json({ error: "Recipient not found" });
          }

          const recipient = recipientResults[0];
          const senderBalanceAfterTransaction = sender.balance - amount;
          const recipientBalanceAfterTransaction =
            parseFloat(recipient.balance) + parseFloat(amount);
          db.beginTransaction((err) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ error: "Error beginning transaction" });
            }

            db.query(
              `UPDATE user SET balance = ? WHERE email = ? AND is_primary = 1`,
              [senderBalanceAfterTransaction, senderEmail],
              (err) => {
                if (err) {
                  return db.rollback(() => {
                    console.error(err);
                    res
                      .status(500)
                      .json({ error: "Error updating sender balance" });
                  });
                }

                db.query(
                  `UPDATE user SET balance = ? WHERE upi_id = ? AND is_primary = 1`,
                  [recipientBalanceAfterTransaction, upiId],
                  (err) => {
                    if (err) {
                      return db.rollback(() => {
                        console.error(err);
                        res
                          .status(500)
                          .json({ error: "Error updating recipient balance" });
                      });
                    }

                    const transactionId = generateUniqueTransactionId(); // Generate unique transaction ID
                    const fromUsername = senderEmail; // Sender email
                    const toUsername = recipient.email; // Receiver email

                    db.query(
                      `INSERT INTO transaction_history (transaction_id, customer_id, account_number, ifsc_code, upi_id, mobile_number, transaction_date, amount, status, payment_method, currency, from_username, to_username) VALUES (?, NULL, NULL, NULL, ?, NULL, ?, ?, 'successful', 'to upi', 'rupees', ?, ?)`,
                      [
                        transactionId,
                        upiId,
                        transactionDate,
                        amount,
                        fromUsername,
                        toUsername,
                      ],
                      (err) => {
                        if (err) {
                          return db.rollback(() => {
                            console.error(err);
                            res.status(500).json({
                              error: "Error inserting transaction details",
                            });
                          });
                        }

                        db.commit((err) => {
                          if (err) {
                            return db.rollback(() => {
                              console.error(err);
                              res.status(500).json({
                                error: "Error committing transaction",
                              });
                            });
                          }
                          res.json({ message: "Transaction successful" });
                        });
                      }
                    );
                  }
                );
              }
            );
          });
        }
      );
    }
  );
};

// Controller function to handle fetching distinct users
exports.getDistinctUsers = (req, res) => {
  const sql =
    "SELECT * FROM user WHERE (email, id) IN (SELECT email, MIN(id) FROM user GROUP BY email)";

  db.query(sql, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result);
  });
};

// Controller function to handle deleting users by email
exports.deleteUsersByEmail = (req, res) => {
  const email = req.params.email;
  const sql = "DELETE FROM user WHERE email = ?";

  db.query(sql, email, (err, result) => {
    if (err) {
      console.error("Error deleting users:", err);
      res.status(500).json({ error: "Failed to delete users" });
      return;
    }
    res.status(200).json({ message: "Users deleted successfully" });
  });
};

// Controller function to fetch transaction history data
exports.getTransactionHistory = (req, res) => {
  const sql = "SELECT * FROM transaction_history";

  db.query(sql, (err, result) => {
    if (err) {
      throw err;
    }
    res.json(result);
  });
};

// Controller function to fetch recent transactions
exports.getRecentTransactions = (req, res) => {
  let sql =
    "SELECT * FROM transaction_history ORDER BY transaction_date DESC LIMIT 5";
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.json(result);
  });
};

// Controller function to search for a user by email
exports.searchUserByEmail = (req, res) => {
  const userEmail = req.query.email;

  let sql = "SELECT * FROM user WHERE email = ?";
  db.query(sql, [userEmail], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
      return;
    }
    if (result.length === 0) {
      res.status(404).json({ message: "No user found" });
    } else {
      res.json(result[0]); // Assuming the query will return only one user
    }
  });
};

// Controller function to fetch suggestions based on email input
exports.getSuggestionsByEmail = (req, res) => {
  const { email } = req.query;
  let sql = "SELECT email FROM user WHERE email LIKE ?";
  db.query(sql, [`%${email}%`], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
      return;
    }
    const suggestions = result.map((row) => row.email);
    res.json({ suggestions });
  });
};

// Controller function to fetch transactions of a user
exports.getUserTransactions = (req, res) => {
  const userEmail = req.user.email;

  let sql = `SELECT *
  FROM transaction_history
  WHERE from_username = ? OR to_username = ?
  ORDER BY transaction_date DESC;`;
  db.query(sql, [userEmail, userEmail], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
      return;
    }
    if (result.length === 0) {
      res.status(404).json({ message: "No user found" });
    } else {
      res.json(result); // Sending the entire result array
    }
  });
};

exports.getAllAdmins = (req, res) => {
  const query = `SELECT * FROM admin`;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error Fetching Admin Data", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    res.json(results);
  });
};
