import { getPort } from "./config";
import { buildServer, corsAllowedOrigins } from "./server";

const port = getPort();
const app = buildServer();

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`listening on ${address}`);
    app.log.info(
      { corsOrigins: corsAllowedOrigins },
      "CORS allowed origins"
    );
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
