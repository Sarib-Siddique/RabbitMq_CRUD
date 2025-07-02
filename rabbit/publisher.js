import amqp from "amqplib";

let channel;

const DLX_EXCHANGE = "dlx.exchange";
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

export async function connectRabbit() {
  const connection = await connectWithRetry("amqp://rabbitmq:5672");
  channel = await connection.createChannel();
  console.log("Connected to RabbitMQ");

  // Declare DLX and DLQ
  await channel.assertExchange(DLX_EXCHANGE, "direct", { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX_EXCHANGE, "dead");
}

export async function publishToQueue(queue, message) {
  if (!channel) throw new Error("Channel is not created");
  // Main queue with DLX
  await channel.assertQueue(queue, {
    durable: false,
    arguments: {
      "x-dead-letter-exchange": DLX_EXCHANGE,
      "x-dead-letter-routing-key": "dead",
    },
  });
  // Send message to the specified queue
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  // Return a confirmation object like your requirement
  return { status: `Message sent to ${queue} queue` };
}

export async function rpcPublishToQueue(queue, message) {
  if (!channel) throw new Error("Channel is not created");
  const { queue: replyQueue } = await channel.assertQueue("", {
    exclusive: true,
  });
  const correlationId = Math.random().toString() + Date.now();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("RPC timeout")), 5000);
    channel.consume(
      replyQueue,
      (msg) => {
        if (msg.properties.correlationId === correlationId) {
          clearTimeout(timeout);
          resolve(JSON.parse(msg.content.toString()));
        }
      },
      { noAck: true }
    );
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      replyTo: replyQueue,
      correlationId,
    });
  });
}
