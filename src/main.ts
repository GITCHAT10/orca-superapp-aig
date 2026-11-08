import { appPool } from "./db.js";
import { createOceanApp } from "./app.js";
const pool=appPool();
const app=createOceanApp(pool);
const port=Number(process.env.PORT??8080);
const shutdown=async()=>{await app.close();await pool.end();};
process.on("SIGTERM",()=>void shutdown());
process.on("SIGINT",()=>void shutdown());
app.listen({port,host:"0.0.0.0"}).catch(async error=>{
  console.error(error);
  await shutdown();
  process.exitCode=1;
});
