import { z } from "zod";
import app from "./app";

const port = z.coerce.number().int().min(1).max(65535).default(3000).parse(process.env.PORT);

app.listen(port, () => {
  console.log(`API рецептів доступне на http://localhost:${port}/api/recipes`);
});
