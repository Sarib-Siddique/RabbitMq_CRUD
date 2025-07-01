import express from "express";
import { sequelize } from "./db.js";
import userRoutes from "./routes/user.route.js";
import { connectRabbit } from "./rabbit/publisher.js";

const app = express();
app.use(express.json());
app.use("/users", userRoutes);

await sequelize.sync();
await connectRabbit();

app.listen(3000, () => console.log("API on http://localhost:3000"));
