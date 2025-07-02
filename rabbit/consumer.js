import amqp from "amqplib";
import { User } from "../models/user.model.js";
import { sequelize } from "../db.js";

await sequelize.sync();

const queues = [
  "user.create",
  "user.read.all",
  "user.read.one",
  "user.update",
  "user.delete",
];

const DLQ = "dead.letter.queue";

async function connectWithRetry(uri, retries = 10, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await amqp.connect(uri);
      return connection;
    } catch (err) {
      console.log(
        `RabbitMQ not ready, retrying in ${delay / 1000}s... (${
          i + 1
        }/${retries})`
      );
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error("Failed to connect to RabbitMQ after multiple attempts");
}

const connection = await connectWithRetry("amqp://rabbitmq:5672");
const channel = await connection.createChannel();
console.log("Consumer connected to RabbitMQ");

for (const q of queues) {
  // Main queue with DLX (should match publisher)
  await channel.assertQueue(q, {
    durable: false,
    arguments: {
      "x-dead-letter-exchange": "dlx.exchange",
      "x-dead-letter-routing-key": "dead",
    },
  });

  channel.consume(q, async (msg) => {
    const content = JSON.parse(msg.content.toString());
    console.log(`Received ${q}:`, content);

    try {
      // Force error for DLQ test
      if (content.forceError) {
        throw new Error("Forced error for DLQ test");
      }

      if (q === "user.create") {
        await User.create(content);
        console.log("User created");
      } else if (q === "user.read.all") {
        const users = await User.findAll();
        console.log(
          "All users:",
          users.map((u) => u.toJSON())
        );
        // Optionally, send users to another queue
      } else if (q === "user.read.one") {
        const user = await User.findByPk(content.id);
        console.log("User:", user ? user.toJSON() : null);
        // Optionally, send user to another queue
      } else if (q === "user.update") {
        const user = await User.findByPk(content.id);
        if (user) {
          await user.update(content);
          console.log("User updated");
        } else {
          console.log("User not found for update");
        }
      } else if (q === "user.delete") {
        const user = await User.findByPk(content.id);
        if (user) {
          await user.destroy();
          console.log("User deleted");
        } else {
          console.log("User not found for delete");
        }
      }

      // Send a generic response for read.all and read.one (no RPC, just confirmation)
      if (
        (q === "user.read.all" || q === "user.read.one") &&
        msg.properties.replyTo &&
        msg.properties.correlationId
      ) {
        await channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify({ status: `Message sent to ${q} queue` })),
          { correlationId: msg.properties.correlationId }
        );
      }

      channel.ack(msg);
    } catch (err) {
      console.error("Error processing message, sending to DLQ", err);
      channel.nack(msg, false, false); // Send to DLX
    }
  });
}

// Optionally, consume from DLQ for logging
await channel.assertQueue(DLQ, { durable: true });
channel.consume(DLQ, (msg) => {
  console.error("Dead lettered message:", msg.content.toString());
  channel.ack(msg);
});
