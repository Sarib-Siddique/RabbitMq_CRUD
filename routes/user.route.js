import express from "express";
import { publishToQueue, rpcPublishToQueue } from "../rabbit/publisher.js"; // import publisher

const router = express.Router();

// Create
router.post("/", async (req, res) => {
  await publishToQueue("user.create", req.body);
  res.json({ status: "Message sent to user.create queue" });
});

// Read All
router.get("/", async (req, res) => {
  await publishToQueue("user.read.all", {});
  res.json({ status: "Message sent to user.read.all queue" });
});

// Read One
router.get("/:id", async (req, res) => {
  const result = await rpcPublishToQueue("user.read.one", { id: req.params.id });
  res.json(result);
});

// Update
router.put("/:id", async (req, res) => {
  const result = await rpcPublishToQueue("user.update", { id: req.params.id, ...req.body });
  res.json(result);
});

// Delete
router.delete("/:id", async (req, res) => {
  const result = await rpcPublishToQueue("user.delete", { id: req.params.id });
  res.json(result);
});

export default router;
