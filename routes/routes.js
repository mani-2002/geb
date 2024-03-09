const express = require("express");
const router = express.Router();
const userController = require("../controllers/controllers");
const { authenticateToken } = require("../auth");

router.post("/register", userController.registerUser);
router.post("/api/login", userController.loginUser);
router.post(
  "/api/link-bank-account",
  authenticateToken,
  userController.linkBankAccount
);
router.get(
  "/api/user-details",
  authenticateToken,
  userController.getUserDetails
);
router.delete(
  "/api/delete-account/:accountNumber",
  authenticateToken,
  userController.deleteAccount
);
router.post(
  "/api/set-primary-account",
  authenticateToken,
  userController.setPrimaryAccount
);
router.get(
  "/api/balance/:accountNumber",
  authenticateToken,
  userController.getAccountBalance
);
router.get("/api/user-emails", authenticateToken, userController.getUserEmails);
router.get(
  "/api/user-details/:email",
  authenticateToken,
  userController.getUserDetailsByEmail
);

router.post("/transfer", authenticateToken, userController.transfer);
router.post("/mob-transfer", authenticateToken, userController.mobTransfer);
router.post("/upi-transfer", authenticateToken, userController.upiTransfer);

router.get(
  "/distinct-users",
  authenticateToken,
  userController.getDistinctUsers
);
router.delete("/delete-users/:email", userController.deleteUsersByEmail);
router.get(
  "/transaction-history",
  authenticateToken,
  userController.getTransactionHistory
);
router.get(
  "/transactions",
  authenticateToken,
  userController.getRecentTransactions
);
router.get("/search", authenticateToken, userController.searchUserByEmail);
router.get(
  "/suggestions",
  authenticateToken,
  userController.getSuggestionsByEmail
);
router.get(
  "/user-transactions",
  authenticateToken,
  userController.getUserTransactions
);

module.exports = router;
