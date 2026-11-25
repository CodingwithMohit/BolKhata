import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, "0.0.0.0", () => {
  console.log(`BolKhata server listening on port ${port}`);
});
