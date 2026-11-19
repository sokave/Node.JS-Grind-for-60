import mongoose from "mongoose";

mongoose.connection.on("error", (error: Error) => {
  console.error("Помилка з’єднання MongoDB", error.name);
});

mongoose.connection.on("disconnected", () => {
  console.log("З’єднання MongoDB закрито");
});

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Вкажіть MONGODB_URI у файлі .env");
  }
  await mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
